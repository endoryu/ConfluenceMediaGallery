#!/usr/bin/env node
/**
 * MG-06-Perf-200 テストページのセットアップ(Phase1_Spec WU-7作業1。冪等)。
 * local/mg06/ の200画像をPUT(create-or-update)で添付し、macroを配置する。
 */
import { readdirSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { request } from '@playwright/test';

const SITE = process.env.MG_SITE ?? 'https://ryu-dev.atlassian.net';
const TITLE = 'MG-06-Perf-200';
const MEDIA_DIR = 'local/mg06';

const ctx = await request.newContext({ storageState: 'local/storageState.json' });

const searchRes = await ctx.get(
  `${SITE}/wiki/rest/api/content/search?cql=${encodeURIComponent('title="MG_00_Smoke" and type=page')}&expand=space,body.storage`,
);
const search = await searchRes.json();
const spaceKey = search.results?.[0]?.space?.key;
if (!spaceKey) throw new Error('MG_00_Smokeからspaceを特定できない');
const smokeBody = search.results?.[0]?.body?.storage?.value ?? '';
const macroXml = smokeBody.match(/<ac:adf-extension>[\s\S]*?<\/ac:adf-extension>/)?.[0] ?? '';
if (!macroXml) throw new Error('macro XMLを抽出できない');

const existingRes = await ctx.get(
  `${SITE}/wiki/rest/api/content/search?cql=${encodeURIComponent(`title="${TITLE}" and type=page`)}`,
);
let pageId = (await existingRes.json()).results?.[0]?.id;
if (pageId) {
  process.stdout.write(`既存ページを使用: ${TITLE}(${pageId})\n`);
} else {
  const createRes = await ctx.post(`${SITE}/wiki/rest/api/content`, {
    data: {
      type: 'page',
      title: TITLE,
      space: { key: spaceKey },
      body: {
        storage: {
          value: `<p>WU-7 200件性能計測用。</p>${macroXml}`,
          representation: 'storage',
        },
      },
    },
  });
  if (!createRes.ok()) throw new Error(`page create failed: ${createRes.status()}`);
  pageId = (await createRes.json()).id;
  process.stdout.write(`ページ作成: ${TITLE}(${pageId})\n`);
}

const existingTitles = new Set();
let cursor = '';
for (;;) {
  const res = await ctx.get(`${SITE}/wiki/api/v2/pages/${pageId}/attachments?limit=250${cursor}`);
  const json = await res.json();
  for (const a of json.results ?? []) existingTitles.add(a.title);
  const next = json._links?.next?.match(/[?&]cursor=([^&]+)/)?.[1];
  if (!next) break;
  cursor = `&cursor=${next}`;
}

const files = readdirSync(MEDIA_DIR).filter((f) => f.endsWith('.jpg'));
let uploaded = 0;
let skipped = 0;
for (const file of files) {
  if (existingTitles.has(file)) {
    skipped += 1;
    continue;
  }
  const res = await ctx.put(`${SITE}/wiki/rest/api/content/${pageId}/child/attachment`, {
    headers: { 'X-Atlassian-Token': 'no-check' },
    multipart: {
      file: { name: file, mimeType: 'image/jpeg', buffer: readFileSync(`${MEDIA_DIR}/${file}`) },
      minorEdit: 'true',
    },
  });
  if (!res.ok()) {
    process.stdout.write(`upload失敗 ${file}: ${res.status()} ${(await res.text()).slice(0, 150)}\n`);
    process.exitCode = 1;
    break;
  }
  uploaded += 1;
  if (uploaded % 20 === 0) process.stdout.write(`upload ${uploaded}/${files.length}…\n`);
}
process.stdout.write(`完了: upload=${uploaded} skip=${skipped}(全${files.length}件)pageId=${pageId}\n`);
await ctx.dispose();
