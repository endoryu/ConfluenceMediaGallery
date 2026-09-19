#!/usr/bin/env node
/**
 * 課金防止ハーネス静的ゲート(verify:cost)。
 * 正本: V1仕様書 §4.7.2、ガイド §4.1。
 *
 * 検査順序(ガイド §4.1):
 *   1. manifest.yml の構造解析(許可リスト照合)
 *   2. package.json / package-lock.json(runtime dependency、license、lock整合)
 *   3. TypeScript AST(通信API、console、Bridge API、global error handler)
 *   4. production build 出力の文字列走査
 *   5. CI / repository 設定
 *   6. 負例fixtureの自己試験
 *   7. 機械可読report生成(test-results/cost-guard/<sha>.json)
 *
 * fail closed: いずれかの検査が失敗・未実行・未知(UNKNOWN)なら非0で終了する。
 * warning-only化・continue-on-error・負例fixture削除は恒久禁止(CLAUDE.md §3)。
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import YAML from 'yaml';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const POLICY_PATH = path.join(ROOT, 'config', 'forge-cost-policy.json');

/** ルール登録簿。report には全ルールの結果を記録する。 */
const RULES = {
  // 1. manifest
  'FCP-MAN-PARSE': 'manifest.yml が解析できない',
  'FCP-MAN-FUNCTION': 'Forge Function の宣言',
  'FCP-MAN-RESOLVER': 'Resolver の宣言',
  'FCP-MAN-TRIGGER': 'Trigger の宣言',
  'FCP-MAN-SCHEDULED-TRIGGER': 'Scheduled Trigger の宣言',
  'FCP-MAN-CONSUMER': 'consumer の宣言',
  'FCP-MAN-WEBTRIGGER': 'webtrigger の宣言',
  'FCP-MAN-QUEUE': 'queue の宣言',
  'FCP-MAN-STORAGE': 'Forge storage(KVS/Custom Entity Store)の宣言',
  'FCP-MAN-SQL': 'Forge SQL の宣言',
  'FCP-MAN-OBJECT-STORE': 'Object Store の宣言',
  'FCP-MAN-CONTAINER': 'Container の宣言',
  'FCP-MAN-LLM': 'Forge LLM の宣言',
  'FCP-MAN-ROVO': 'Rovo module の宣言',
  'FCP-MAN-REMOTES': 'remotes の宣言',
  'FCP-MAN-EXTERNAL-AUTH': 'external authentication provider の宣言',
  'FCP-MAN-LICENSING': 'app.licensing の宣言',
  'FCP-MAN-EXTERNAL-PERMISSION': 'permissions.external(egress)の宣言',
  'FCP-MAN-WILDCARD-HOST': 'wildcard host の宣言',
  'FCP-MAN-NON-ATLASSIAN-ORIGIN': '非Atlassian origin の宣言',
  'FCP-MAN-UNKNOWN-KEY': '許可リスト外のmanifest key',
  'FCP-MAN-MODULE': '許可リスト外のmodule種別',
  'FCP-MAN-MACRO': 'macro定義が許可構成外',
  'FCP-MAN-RESOURCE': 'resource定義が許可構成外',
  'FCP-MAN-SCOPE': '許可リスト外のscope',
  'FCP-MAN-APP': 'app定義が許可構成外',
  // 2. package / lockfile
  'FCP-PKG-RUNTIME-DEP': '@forge/bridge 以外のruntime dependency',
  'FCP-PKG-COPYLEFT': 'copyleft licenseのpackage',
  'FCP-PKG-LICENSE-UNKNOWN': 'license不明・許可リスト外licenseのpackage',
  'FCP-PKG-LOCK-SYNC': 'package.json と package-lock.json の不整合',
  'FCP-PKG-PARSE': 'package.json / package-lock.json が解析できない',
  // 3. source AST
  'FCP-SRC-FETCH': 'fetch の直接使用',
  'FCP-SRC-XHR': 'XMLHttpRequest の使用',
  'FCP-SRC-WEBSOCKET': 'WebSocket の使用',
  'FCP-SRC-EVENTSOURCE': 'EventSource の使用',
  'FCP-SRC-SENDBEACON': 'sendBeacon の使用',
  'FCP-SRC-INVOKE': 'invoke / invokeRemote の使用',
  'FCP-SRC-BRIDGE-API': '許可リスト外の@forge/bridge API import',
  'FCP-SRC-BRIDGE-SCOPE': 'src/shared/api 外での@forge/bridge import',
  'FCP-SRC-FORGE-API': '@forge/bridge 以外の@forge/* import',
  'FCP-SRC-EXTERNAL-IMPORT': '外部packageのruntime import',
  'FCP-SRC-CONSOLE-ERROR': 'console.error の使用',
  'FCP-SRC-CONSOLE-LOG': 'console.log の使用',
  'FCP-SRC-CONSOLE-OTHER': 'その他のconsole出力',
  'FCP-SRC-HANDLER-REQUIRED': 'global error handler が未登録',
  'FCP-SRC-HANDLER-ENTRY': 'entry が global error handler を登録していない',
  'FCP-SRC-HANDLER-CONSOLE': 'global error handler がconsoleを呼ぶ',
  'FCP-SRC-HANDLER-RETHROW': 'global error handler 登録ファイルにthrowがある',
  'FCP-SRC-HANDLER-SYNC': 'click/pointerenter handlerにawaitが含まれる(同期処理とrequest発行のみ — V1 §4.5.2)',
  // 4. build
  'FCP-BLD-MISSING': 'production build 出力が存在しない',
  'FCP-BLD-CONSOLE': 'build出力に console.error / console.log が残存',
  'FCP-BLD-COMM': 'build出力に直接通信APIが残存',
  'FCP-BLD-FORGE-API': 'build出力に @forge/bridge 以外の@forge/* 参照',
  'FCP-BLD-ORIGIN': 'build出力に許可リスト外のURL literal',
  'FCP-BLD-FLAG': '節約策比較フラグ識別子がproduction buildに残存',
  // 5. CI / repository
  'FCP-CI-MISSING': 'CI workflow が存在しない',
  'FCP-CI-PARSE': 'CI workflow が解析できない',
  'FCP-CI-RUNNER': '許可リスト外のrunner',
  'FCP-CI-ARTIFACT-UPLOAD': 'artifact / package upload の使用',
  'FCP-CI-LFS': 'LFS の使用',
  'FCP-CI-RETENTION': 'retention 設定の使用',
  'FCP-CI-UNKNOWN-ACTION': '許可リスト外のaction',
  'FCP-CI-CONFIRM-SCOPES': '--confirm-scopes / --non-interactive の使用',
  'FCP-CI-PROD-DEPLOY': 'CIからのproduction deploy',
  'FCP-CI-PLAN': 'CI provider planの裁定記録が無効(cost-surface-register.md)',
  // 6. fixtures
  'FCP-FIX-MISSING': '負例fixtureの欠落',
  'FCP-FIX-MISS': '負例fixtureが期待rule IDで失敗しない',
  // 実行完全性
  'FCP-EXEC': '検査が実行不能',
};

const COPYLEFT_PATTERN = /GPL|SSPL|EUPL|OSL-|CPAL|CeCILL|MPL/i;

/** @typedef {{rule: string, level: 'RED'|'UNKNOWN', target: string, message: string}} Finding */

// ---------- 共通ユーティリティ ----------

function finding(rule, level, target, message) {
  if (!RULES[rule]) throw new Error(`unregistered rule id: ${rule}`);
  return { rule, level, target, message };
}

function walkDir(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walkDir(p, out);
    else out.push(p);
  }
  return out;
}

function rel(p) {
  return path.relative(ROOT, p).replaceAll('\\', '/');
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function deepWalk(value, visit, keyPath = []) {
  if (Array.isArray(value)) {
    value.forEach((v, i) => deepWalk(v, visit, [...keyPath, String(i)]));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      visit([...keyPath, k], k, v);
      deepWalk(v, visit, [...keyPath, k]);
    }
  }
}

// ---------- 1. manifest ----------

export function analyzeManifest(text, policy, target = 'manifest.yml') {
  const findings = [];
  const m = policy.manifest;
  let doc;
  try {
    doc = YAML.parse(text);
  } catch (e) {
    return [finding('FCP-MAN-PARSE', 'UNKNOWN', target, `YAML parse error: ${e.message}`)];
  }
  if (!doc || typeof doc !== 'object') {
    return [finding('FCP-MAN-PARSE', 'UNKNOWN', target, 'manifest is empty or not a mapping')];
  }

  // 拒否keyの全域走査(V1仕様書 §4.7.2 検出対象2)
  deepWalk(doc, (keyPath, key) => {
    const rule = m.deniedKeyRules[key];
    if (rule) {
      findings.push(finding(rule, 'RED', target, `denied key '${keyPath.join('.')}'`));
    }
  });

  // permissions.external の特別扱い(egress、wildcard、非Atlassian origin)
  const external = doc.permissions?.external;
  if (external !== undefined) {
    findings.push(
      finding('FCP-MAN-EXTERNAL-PERMISSION', 'RED', target, 'permissions.external is declared'),
    );
    const strings = [];
    const collectStrings = (v) => {
      if (typeof v === 'string') strings.push(v);
      else if (Array.isArray(v)) v.forEach(collectStrings);
      else if (v && typeof v === 'object') Object.values(v).forEach(collectStrings);
    };
    collectStrings(external);
    for (const value of strings) {
      if (value.includes('*')) {
        findings.push(finding('FCP-MAN-WILDCARD-HOST', 'RED', target, `wildcard host '${value}'`));
        continue;
      }
      const host = /^https?:\/\//.test(value) ? new URL(value).hostname : value;
      if (!host.includes('.')) continue;
      const isAtlassian = m.atlassianOriginSuffixes.some(
        (s) => host === s.slice(1) || host.endsWith(s),
      );
      if (!isAtlassian) {
        findings.push(
          finding('FCP-MAN-NON-ATLASSIAN-ORIGIN', 'RED', target, `non-Atlassian origin '${value}'`),
        );
      }
    }
  }

  // 正の許可リスト照合
  for (const key of Object.keys(doc)) {
    if (!m.allowedTopLevelKeys.includes(key) && !m.deniedKeyRules[key]) {
      findings.push(finding('FCP-MAN-UNKNOWN-KEY', 'UNKNOWN', target, `top-level key '${key}'`));
    }
  }
  const modules = doc.modules;
  if (modules && typeof modules === 'object') {
    for (const key of Object.keys(modules)) {
      if (m.deniedKeyRules[key]) continue; // 拒否走査で計上済み
      if (!m.allowedModuleTypes.includes(key)) {
        findings.push(finding('FCP-MAN-MODULE', 'RED', target, `module type '${key}'`));
        continue;
      }
      for (const entry of [].concat(modules[key] ?? [])) {
        for (const [ek, ev] of Object.entries(entry ?? {})) {
          if (m.deniedKeyRules[ek]) continue;
          if (!m.macroAllowedKeys.includes(ek)) {
            findings.push(finding('FCP-MAN-MACRO', 'RED', target, `macro key '${ek}'`));
          }
          const required = m.macroRequiredValues[ek];
          if (required !== undefined && ev !== required) {
            findings.push(
              finding('FCP-MAN-MACRO', 'RED', target, `macro ${ek}='${ev}' (required '${required}')`),
            );
          }
        }
        if (entry?.resource !== undefined && !m.allowedResourceKeys.includes(entry.resource)) {
          findings.push(finding('FCP-MAN-MACRO', 'RED', target, `macro resource '${entry.resource}'`));
        }
      }
    }
  }
  for (const res of [].concat(doc.resources ?? [])) {
    for (const rk of Object.keys(res ?? {})) {
      if (!m.resourceEntryAllowedKeys.includes(rk)) {
        findings.push(finding('FCP-MAN-RESOURCE', 'RED', target, `resource key '${rk}'`));
      }
    }
    if (!m.allowedResourceKeys.includes(res?.key)) {
      findings.push(finding('FCP-MAN-RESOURCE', 'RED', target, `resource '${res?.key}'`));
    }
    if (typeof res?.path !== 'string' || !res.path.startsWith(m.resourcePathPrefix)) {
      findings.push(finding('FCP-MAN-RESOURCE', 'RED', target, `resource path '${res?.path}'`));
    }
  }
  const permissions = doc.permissions;
  if (permissions && typeof permissions === 'object') {
    for (const key of Object.keys(permissions)) {
      if (key === 'external') continue; // 上で計上済み
      if (!m.allowedPermissionKeys.includes(key)) {
        findings.push(finding('FCP-MAN-UNKNOWN-KEY', 'UNKNOWN', target, `permissions.${key}`));
      }
    }
    for (const scope of [].concat(permissions.scopes ?? [])) {
      if (!m.allowedScopes.includes(scope)) {
        findings.push(finding('FCP-MAN-SCOPE', 'RED', target, `scope '${scope}'`));
      }
    }
  }
  if (doc.app && typeof doc.app === 'object') {
    for (const key of Object.keys(doc.app)) {
      if (m.deniedKeyRules[key]) continue;
      if (!m.allowedAppKeys.includes(key)) {
        findings.push(finding('FCP-MAN-APP', 'RED', target, `app.${key}`));
      }
    }
  }
  return findings;
}

// ---------- 2. package / lockfile ----------

export function analyzePackage(pkg, policy, target = 'package.json') {
  const findings = [];
  const deps = Object.keys(pkg.dependencies ?? {});
  for (const dep of deps) {
    if (!policy.dependencies.allowedRuntime.includes(dep)) {
      findings.push(finding('FCP-PKG-RUNTIME-DEP', 'RED', target, `runtime dependency '${dep}'`));
    }
  }
  for (const scriptText of Object.values(pkg.scripts ?? {})) {
    for (const banned of policy.ci.bannedRunSubstrings) {
      if (String(scriptText).includes(banned)) {
        findings.push(finding('FCP-CI-CONFIRM-SCOPES', 'RED', target, `npm script contains '${banned}'`));
      }
    }
  }
  return findings;
}

function licenseAllowed(expr, allowlist) {
  if (typeof expr !== 'string' || expr.trim() === '') return false;
  const cleaned = expr.replace(/[()]/g, ' ').trim();
  if (/\sOR\s/.test(cleaned)) {
    return cleaned.split(/\sOR\s/).some((p) => licenseAllowed(p, allowlist));
  }
  if (/\sAND\s/.test(cleaned)) {
    return cleaned.split(/\sAND\s/).every((p) => licenseAllowed(p, allowlist));
  }
  return allowlist.includes(cleaned);
}

export function analyzeLockfile(lock, pkg, policy, opts = {}, target = 'package-lock.json') {
  const findings = [];
  const packages = lock.packages;
  if (!packages || typeof packages !== 'object') {
    return [finding('FCP-PKG-PARSE', 'UNKNOWN', target, 'lockfile has no packages section')];
  }
  // lock整合(root entryとpackage.jsonの一致)
  const rootDeps = packages['']?.dependencies ?? {};
  const pkgDeps = pkg.dependencies ?? {};
  const same =
    Object.keys(rootDeps).length === Object.keys(pkgDeps).length &&
    Object.entries(pkgDeps).every(([k, v]) => rootDeps[k] === v);
  if (!same) {
    findings.push(
      finding('FCP-PKG-LOCK-SYNC', 'UNKNOWN', target, 'package.json dependencies differ from lockfile root'),
    );
  }
  // runtime到達packageのlicense検査(V1仕様書 §4.7.2 検出対象10)
  for (const [key, entry] of Object.entries(packages)) {
    if (key === '' || !entry || entry.dev === true) continue;
    const pkgName = key.split('node_modules/').pop() ?? key;
    // Atlassian第一者scope(@forge/*)はForge Terms下で提供されSPDX表記を持たない。
    // L2 §0.1 が @forge/bridge を明示許可するため、SPDX照合を免除する(policy.trustedScopes)。
    if ((policy.dependencies.trustedScopes ?? []).some((s) => pkgName.startsWith(s))) continue;
    let license = entry.license;
    if (license === undefined && opts.resolveNodeModules !== false) {
      const pkgJsonPath = path.join(ROOT, key, 'package.json');
      if (fs.existsSync(pkgJsonPath)) {
        try {
          license = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')).license;
        } catch {
          license = undefined;
        }
      }
    }
    if (typeof license !== 'string' || license.trim() === '') {
      findings.push(finding('FCP-PKG-LICENSE-UNKNOWN', 'RED', target, `no license for '${key}'`));
    } else if (COPYLEFT_PATTERN.test(license)) {
      findings.push(finding('FCP-PKG-COPYLEFT', 'RED', target, `copyleft license '${license}' for '${key}'`));
    } else if (!licenseAllowed(license, policy.dependencies.permissiveLicenses)) {
      findings.push(
        finding('FCP-PKG-LICENSE-UNKNOWN', 'RED', target, `license '${license}' for '${key}' is not allowlisted`),
      );
    }
  }
  return findings;
}

// ---------- 3. source AST ----------

/** handler本体に直接のawaitがあるか(入れ子の関数内は対象外=fire-and-forget許容) */
function containsDirectAwait(fnNode) {
  let found = false;
  const walk = (node) => {
    if (found) return;
    if (node !== fnNode && (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node))) {
      return; // 入れ子関数の中は別コンテキスト
    }
    if (ts.isAwaitExpression(node)) {
      found = true;
      return;
    }
    ts.forEachChild(node, walk);
  };
  ts.forEachChild(fnNode, walk);
  return found;
}

export function analyzeSourceFile(fileName, text, policy) {
  const findings = [];
  const target = rel(path.isAbsolute(fileName) ? fileName : path.join(ROOT, fileName));
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const state = {
    registersError: false,
    registersRejection: false,
    hasConsole: false,
    hasThrow: false,
    calledIdentifiers: new Set(),
  };
  const inAllowedBridgeDir = policy.source.bridgeAllowedImportDirs.some((d) =>
    target.startsWith(`${d}/`),
  );

  const checkImport = (specifier, importClause) => {
    if (importClause?.isTypeOnly) return;
    if (specifier === '@forge/bridge') {
      if (!inAllowedBridgeDir) {
        findings.push(finding('FCP-SRC-BRIDGE-SCOPE', 'RED', target, '@forge/bridge import outside src/shared/api'));
      }
      const named = importClause?.namedBindings;
      if (named && ts.isNamedImports(named)) {
        for (const el of named.elements) {
          const name = (el.propertyName ?? el.name).text;
          if (name === 'invoke' || name === 'invokeRemote') {
            findings.push(finding('FCP-SRC-INVOKE', 'RED', target, `import of '${name}'`));
          } else if (!policy.source.bridgeAllowedImports.includes(name)) {
            findings.push(finding('FCP-SRC-BRIDGE-API', 'RED', target, `bridge API '${name}'`));
          }
        }
      }
    } else if (specifier.startsWith('@forge/')) {
      findings.push(finding('FCP-SRC-FORGE-API', 'RED', target, `import '${specifier}'`));
    } else if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
      findings.push(finding('FCP-SRC-EXTERNAL-IMPORT', 'RED', target, `import '${specifier}'`));
    }
  };

  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      checkImport(node.moduleSpecifier.text, node.importClause);
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (callee.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        checkImport(node.arguments[0].text, undefined);
      }
      if (ts.isIdentifier(callee)) {
        state.calledIdentifiers.add(callee.text);
        if (callee.text === 'fetch') {
          findings.push(finding('FCP-SRC-FETCH', 'RED', target, 'fetch()'));
        }
      }
      if (ts.isPropertyAccessExpression(callee)) {
        const prop = callee.name.text;
        if (prop === 'fetch') findings.push(finding('FCP-SRC-FETCH', 'RED', target, '*.fetch()'));
        if (prop === 'sendBeacon') findings.push(finding('FCP-SRC-SENDBEACON', 'RED', target, 'sendBeacon()'));
        if (ts.isIdentifier(callee.expression) && callee.expression.text === 'console') {
          state.hasConsole = true;
          if (prop === 'error') findings.push(finding('FCP-SRC-CONSOLE-ERROR', 'RED', target, 'console.error'));
          else if (prop === 'log') findings.push(finding('FCP-SRC-CONSOLE-LOG', 'RED', target, 'console.log'));
          else findings.push(finding('FCP-SRC-CONSOLE-OTHER', 'RED', target, `console.${prop}`));
        }
        if (prop === 'addEventListener' && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
          const eventName = node.arguments[0].text;
          if (eventName === 'error') state.registersError = true;
          if (eventName === 'unhandledrejection') state.registersRejection = true;
          // V1 §4.5.2: click/pointerenter handlerは同期処理とrequest発行のみ(直接のawait禁止)
          if ((eventName === 'click' || eventName === 'pointerenter') && node.arguments[1]) {
            const handler = node.arguments[1];
            if (
              (ts.isArrowFunction(handler) || ts.isFunctionExpression(handler)) &&
              containsDirectAwait(handler)
            ) {
              findings.push(
                finding('FCP-SRC-HANDLER-SYNC', 'RED', target, `${eventName} handlerにawait`),
              );
            }
          }
        }
      }
    }
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      if (name === 'XMLHttpRequest') findings.push(finding('FCP-SRC-XHR', 'RED', target, 'new XMLHttpRequest'));
      if (name === 'WebSocket') findings.push(finding('FCP-SRC-WEBSOCKET', 'RED', target, 'new WebSocket'));
      if (name === 'EventSource') findings.push(finding('FCP-SRC-EVENTSOURCE', 'RED', target, 'new EventSource'));
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left)
    ) {
      const prop = node.left.name.text;
      if (prop === 'onerror') state.registersError = true;
      if (prop === 'onunhandledrejection') state.registersRejection = true;
    }
    if (ts.isThrowStatement(node)) state.hasThrow = true;
    ts.forEachChild(node, visit);
  };
  visit(sf);

  const registersHandler = state.registersError || state.registersRejection;
  if (registersHandler && state.hasConsole) {
    findings.push(
      finding('FCP-SRC-HANDLER-CONSOLE', 'RED', target, 'global error handler file calls console'),
    );
  }
  if (registersHandler && state.hasThrow) {
    findings.push(
      finding('FCP-SRC-HANDLER-RETHROW', 'RED', target, 'global error handler file contains throw'),
    );
  }
  return { findings, state };
}

export function analyzeSourceTree(policy) {
  const findings = [];
  const srcDir = path.join(ROOT, policy.source.srcDir);
  const files = walkDir(srcDir).filter((f) => f.endsWith('.ts'));
  let anyHandler = false;
  const perFile = new Map();
  for (const file of files) {
    const { findings: f, state } = analyzeSourceFile(file, fs.readFileSync(file, 'utf8'), policy);
    findings.push(...f);
    perFile.set(rel(file), state);
    if (state.registersError && state.registersRejection) anyHandler = true;
  }
  if (!anyHandler) {
    findings.push(
      finding('FCP-SRC-HANDLER-REQUIRED', 'RED', policy.source.srcDir, 'no module registers error + unhandledrejection handlers (V1 spec 8.4)'),
    );
  }
  for (const entry of policy.source.handlerEntryFiles) {
    const state = perFile.get(entry);
    if (!state || !state.calledIdentifiers.has('registerGlobalErrorHandler')) {
      findings.push(
        finding('FCP-SRC-HANDLER-ENTRY', 'RED', entry, 'entry does not call registerGlobalErrorHandler()'),
      );
    }
  }
  return findings;
}

// ---------- 4. build 出力走査 ----------

export function analyzeBuild(policy) {
  const findings = [];
  const distDir = path.join(ROOT, policy.build.distDir);
  const files = walkDir(distDir).filter((f) => /\.(js|mjs|html|css)$/.test(f));
  if (files.length === 0) {
    return [finding('FCP-BLD-MISSING', 'UNKNOWN', policy.build.distDir, 'run `npm run build` before verify:cost')];
  }
  for (const file of files) {
    // @forge/bridge専用vendor chunkは第一者SDK内部のため文字列走査を免除
    // (policy.build.vendorChunkPrefixes)。自コードのchunkは全面走査する。
    const base = path.basename(file);
    if ((policy.build.vendorChunkPrefixes ?? []).some((p) => base.startsWith(p))) continue;
    const text = fs.readFileSync(file, 'utf8');
    const target = rel(file);
    if (/console\s*\.\s*(error|log)\b/.test(text)) {
      findings.push(finding('FCP-BLD-CONSOLE', 'RED', target, 'console.error / console.log in build output'));
    }
    if (/\bfetch\s*\(/.test(text) || /\bXMLHttpRequest\b/.test(text) || /\bWebSocket\b/.test(text) || /\bEventSource\b/.test(text) || /\bsendBeacon\b/.test(text)) {
      findings.push(finding('FCP-BLD-COMM', 'RED', target, 'direct communication API in build output'));
    }
    if (/@forge\/(?!bridge)/.test(text)) {
      findings.push(finding('FCP-BLD-FORGE-API', 'RED', target, 'non-bridge @forge/* reference in build output'));
    }
    // 節約策比較フラグはvite defineで定数畳み込みされ識別子が残らないこと(V1 §4.7.2/CLAUDE.md §8)
    if (/__MG_SAVINGS/.test(text)) {
      findings.push(finding('FCP-BLD-FLAG', 'RED', target, 'savings flag identifier in build output'));
    }
    for (const url of text.match(/https?:\/\/[A-Za-z0-9.-]+[^\s"'`<>)]*/g) ?? []) {
      if (!policy.build.allowedUrlPrefixes.some((p) => url.startsWith(p))) {
        findings.push(finding('FCP-BLD-ORIGIN', 'RED', target, `URL literal '${url}'`));
      }
    }
  }
  return findings;
}

// ---------- 5. CI / repository ----------

export function analyzeCiWorkflow(text, policy, target) {
  const findings = [];
  let doc;
  try {
    doc = YAML.parse(text);
  } catch (e) {
    return [finding('FCP-CI-PARSE', 'UNKNOWN', target, `YAML parse error: ${e.message}`)];
  }
  if (!doc || typeof doc !== 'object') {
    return [finding('FCP-CI-PARSE', 'UNKNOWN', target, 'workflow is empty')];
  }
  for (const [jobName, job] of Object.entries(doc.jobs ?? {})) {
    const runsOn = [].concat(job?.['runs-on'] ?? []);
    if (runsOn.length === 0) {
      findings.push(finding('FCP-CI-RUNNER', 'UNKNOWN', target, `job '${jobName}' has no runs-on`));
    }
    for (const runner of runsOn) {
      if (!policy.ci.allowedRunners.includes(runner)) {
        findings.push(finding('FCP-CI-RUNNER', 'RED', target, `job '${jobName}' runner '${runner}'`));
      }
    }
    for (const step of [].concat(job?.steps ?? [])) {
      if (typeof step?.uses === 'string') {
        const actionName = step.uses.split('@')[0];
        if (/upload-artifact|upload-pages-artifact|upload-release/.test(actionName)) {
          findings.push(finding('FCP-CI-ARTIFACT-UPLOAD', 'RED', target, `uses '${step.uses}'`));
        } else if (!policy.ci.allowedActions.includes(actionName)) {
          findings.push(finding('FCP-CI-UNKNOWN-ACTION', 'UNKNOWN', target, `uses '${step.uses}'`));
        }
        if (step.with?.lfs === true) {
          findings.push(finding('FCP-CI-LFS', 'RED', target, `uses '${step.uses}' with lfs: true`));
        }
      }
      if (typeof step?.run === 'string') {
        for (const banned of policy.ci.bannedRunSubstrings) {
          if (step.run.includes(banned)) {
            const rule = banned === 'forge deploy -e production' ? 'FCP-CI-PROD-DEPLOY' : 'FCP-CI-CONFIRM-SCOPES';
            findings.push(finding(rule, 'RED', target, `run step contains '${banned}'`));
          }
        }
      }
    }
  }
  deepWalk(doc, (keyPath, key) => {
    if (key === 'retention-days') {
      findings.push(finding('FCP-CI-RETENTION', 'RED', target, `'retention-days' at ${keyPath.join('.')}`));
    }
  });
  return findings;
}

export function parseRegister(text) {
  const m = text.match(/<!--\s*cost-policy:machine-readable\s*\n([\s\S]*?)-->/);
  if (!m) return null;
  try {
    return YAML.parse(m[1]) ?? null;
  } catch {
    return null;
  }
}

export function analyzeCiTree(policy, nowUtcMs) {
  const findings = [];
  const wfDir = path.join(ROOT, policy.ci.workflowDir);
  const workflows = walkDir(wfDir).filter((f) => /\.(ya?ml)$/.test(f));
  if (workflows.length === 0) {
    findings.push(finding('FCP-CI-MISSING', 'UNKNOWN', policy.ci.workflowDir, 'no CI workflow found'));
  }
  for (const wf of workflows) {
    findings.push(...analyzeCiWorkflow(fs.readFileSync(wf, 'utf8'), policy, rel(wf)));
  }
  // CI provider planは静的確認不能のため、cost-surface registerの裁定記録IDを要求する(ガイド §4.1 手順5)
  const registerPath = path.join(ROOT, policy.register.path);
  let adjudicationOk = false;
  let registerInfo = { adjudicationIds: [], lastConfirmed: null };
  if (fs.existsSync(registerPath)) {
    const parsed = parseRegister(fs.readFileSync(registerPath, 'utf8'));
    const adjudications = [].concat(parsed?.adjudications ?? []);
    registerInfo.adjudicationIds = adjudications.map((a) => a?.id).filter(Boolean);
    const maxAgeMs = policy.ci.planAdjudicationMaxAgeDays * 24 * 60 * 60 * 1000;
    for (const adj of adjudications) {
      if (
        adj?.surface === policy.ci.planAdjudicationSurface &&
        typeof adj?.id === 'string' &&
        adj.id.trim() !== '' &&
        adj?.date &&
        nowUtcMs - Date.parse(String(adj.date)) <= maxAgeMs &&
        Number.isFinite(Date.parse(String(adj.date)))
      ) {
        adjudicationOk = true;
        registerInfo.lastConfirmed = String(adj.date);
      }
    }
  }
  if (!adjudicationOk) {
    findings.push(
      finding(
        'FCP-CI-PLAN',
        'UNKNOWN',
        policy.register.path,
        `no valid adjudication (surface '${policy.ci.planAdjudicationSurface}', within ${policy.ci.planAdjudicationMaxAgeDays} days) — user must record GitHub plan confirmation`,
      ),
    );
  }
  return { findings, registerInfo };
}

// ---------- 6. 負例fixture 自己試験 ----------

function runFixtureAnalyzer(expected, fixtureDir, policy) {
  const filePath = path.join(fixtureDir, expected.file);
  const text = fs.readFileSync(filePath, 'utf8');
  switch (expected.target) {
    case 'manifest':
      return analyzeManifest(text, policy, rel(filePath));
    case 'package':
      return analyzePackage(JSON.parse(text), policy, rel(filePath));
    case 'lockfile':
      return analyzeLockfile(JSON.parse(text), { dependencies: { '@forge/bridge': '^7.0.0' } }, policy, { resolveNodeModules: false }, rel(filePath));
    case 'source':
      return analyzeSourceFile(filePath, text, policy).findings;
    case 'ci':
      return analyzeCiWorkflow(text, policy, rel(filePath));
    default:
      throw new Error(`unknown fixture target '${expected.target}'`);
  }
}

export function runFixtureSelfTest(policy) {
  const findings = [];
  const results = [];
  const baseDir = path.join(ROOT, policy.fixtures.dir);
  for (const category of policy.fixtures.requiredCategories) {
    const dir = path.join(baseDir, category);
    const expectedPath = path.join(dir, 'expected.json');
    if (!fs.existsSync(expectedPath)) {
      findings.push(finding('FCP-FIX-MISSING', 'UNKNOWN', `${policy.fixtures.dir}/${category}`, 'fixture or expected.json missing'));
      results.push({ category, expectRule: null, matched: false, observed: [] });
      continue;
    }
    let observed;
    let expected;
    try {
      expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
      observed = runFixtureAnalyzer(expected, dir, policy);
    } catch (e) {
      findings.push(finding('FCP-FIX-MISSING', 'UNKNOWN', `${policy.fixtures.dir}/${category}`, `fixture not analyzable: ${e.message}`));
      results.push({ category, expectRule: expected?.expectRule ?? null, matched: false, observed: [] });
      continue;
    }
    const observedRules = [...new Set(observed.map((f) => f.rule))];
    const matched = observedRules.includes(expected.expectRule);
    results.push({ category, expectRule: expected.expectRule, matched, observed: observedRules });
    if (!matched) {
      findings.push(
        finding('FCP-FIX-MISS', 'RED', `${policy.fixtures.dir}/${category}`, `expected ${expected.expectRule}, observed [${observedRules.join(', ')}]`),
      );
    }
  }
  return { findings, results };
}

// ---------- 7. report ----------

function gitInfo() {
  try {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim() !== '';
    return { sha, dirty };
  } catch {
    return { sha: null, dirty: true };
  }
}

function main() {
  const policy = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
  const allFindings = [];
  let fixtureResults = [];
  let registerInfo = { adjudicationIds: [], lastConfirmed: null };

  const phases = [
    ['manifest', () => {
      const p = path.join(ROOT, 'manifest.yml');
      if (!fs.existsSync(p)) return [finding('FCP-MAN-PARSE', 'UNKNOWN', 'manifest.yml', 'file missing')];
      return analyzeManifest(fs.readFileSync(p, 'utf8'), policy);
    }],
    ['package', () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
      const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
      return [...analyzePackage(pkg, policy), ...analyzeLockfile(lock, pkg, policy)];
    }],
    ['source', () => analyzeSourceTree(policy)],
    ['build', () => analyzeBuild(policy)],
    ['ci', () => {
      const r = analyzeCiTree(policy, Date.now());
      registerInfo = r.registerInfo;
      return r.findings;
    }],
    ['fixtures', () => {
      const r = runFixtureSelfTest(policy);
      fixtureResults = r.results;
      return r.findings;
    }],
  ];

  for (const [name, run] of phases) {
    try {
      allFindings.push(...run());
    } catch (e) {
      allFindings.push(finding('FCP-EXEC', 'UNKNOWN', name, `phase failed: ${e.message}`));
    }
  }

  const hasRed = allFindings.some((f) => f.level === 'RED');
  const hasUnknown = allFindings.some((f) => f.level === 'UNKNOWN');
  const status = hasRed ? 'RED' : hasUnknown ? 'UNKNOWN' : 'GREEN';

  const { sha, dirty } = gitInfo();
  const failedRules = new Map();
  for (const f of allFindings) {
    const level = failedRules.get(f.rule);
    if (level !== 'RED') failedRules.set(f.rule, f.level === 'RED' ? 'RED' : 'UNKNOWN');
  }
  const report = {
    schema: 'cost-guard-report/1',
    generatedAtUtc: new Date().toISOString(),
    commitSha: sha ?? 'UNAVAILABLE',
    workingTreeDirty: dirty,
    policyVersion: policy.policyVersion,
    policyHash: sha256(POLICY_PATH),
    manifestHash: fs.existsSync(path.join(ROOT, 'manifest.yml')) ? sha256(path.join(ROOT, 'manifest.yml')) : null,
    lockfileHash: fs.existsSync(path.join(ROOT, 'package-lock.json')) ? sha256(path.join(ROOT, 'package-lock.json')) : null,
    register: registerInfo,
    status,
    rules: Object.keys(RULES).map((id) => ({
      id,
      description: RULES[id],
      result: failedRules.has(id) ? (failedRules.get(id) === 'RED' ? 'FAIL' : 'UNKNOWN') : 'PASS',
    })),
    findings: allFindings,
    fixtures: fixtureResults,
  };

  if (sha === null) {
    report.status = 'UNKNOWN';
    report.findings.push(finding('FCP-EXEC', 'UNKNOWN', 'git', 'commit SHA unavailable'));
  }

  const reportDir = path.join(ROOT, policy.report.dir);
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `${sha ?? 'UNCOMMITTED'}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  // report完全性の自己検証
  const readBack = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  for (const field of ['commitSha', 'policyVersion', 'manifestHash', 'lockfileHash', 'status', 'rules']) {
    if (readBack[field] === undefined || readBack[field] === null) {
      process.stdout.write(`verify:cost: report incomplete (missing ${field})\n`);
      process.exitCode = 1;
      return;
    }
  }

  const lines = [
    `verify:cost status: ${report.status}`,
    `  findings: RED=${allFindings.filter((f) => f.level === 'RED').length} UNKNOWN=${allFindings.filter((f) => f.level === 'UNKNOWN').length}`,
    `  fixtures: ${fixtureResults.filter((r) => r.matched).length}/${fixtureResults.length} matched`,
    `  report: ${rel(reportPath)}`,
  ];
  for (const f of allFindings) {
    lines.push(`  [${f.level}] ${f.rule} ${f.target}: ${f.message}`);
  }
  process.stdout.write(`${lines.join('\n')}\n`);
  process.exitCode = report.status === 'GREEN' ? 0 : 1;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH;
if (isDirectRun) main();
