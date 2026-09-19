#!/usr/bin/env node
/**
 * WU-7計測条件の制御(自己管理thumbキャッシュのみ操作。ユーザーコンテンツ不変)。
 * 使い方:
 *   node scripts/e2e-thumbcache-control.mjs --page "MG-06-Perf-200" --disabled true [--clear]
 * --clear   mg_thumbcache_*(config除く)を削除する(thumbなし条件の準備)
 * --disabled true|false  mg_thumbcache_config の生成無効化フラグを設定する
 */
import process from 'node:process';
import { request } from '@playwright/test';

const SITE = process.env.MG_SITE ?? 'https://ryu-dev.atlassian.net';
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const title = opt('page');
const disabled = opt('disabled');
const clear = args.includes('--clear');
if (!title) throw new Error('--page <title> が必要');

const ctx = await request.newContext({ storageState: 'local/storageState.json' });
const searchRes = await ctx.get(
  `${SITE}/wiki/rest/api/content/search?cql=${encodeURIComponent(`title="${title}" and type=page`)}`,
);
const pageId = (await searchRes.json()).results?.[0]?.id;
if (!pageId) throw new Error(`page not found: ${title}`);

const attachments = [];
let cursor = '';
for (;;) {
  const res = await ctx.get(`${SITE}/wiki/api/v2/pages/${pageId}/attachments?limit=250${cursor}`);
  const json = await res.json();
  attachments.push(...(json.results ?? []));
  const next = json._links?.next?.match(/[?&]cursor=([^&]+)/)?.[1];
  if (!next) break;
  cursor = `&cursor=${next}`;
}

if (clear) {
  const targets = attachments.filter(
    (a) => /^mg_thumbcache_[A-Za-z0-9]+_v\d+_w\d+$/.test(a.title ?? ''),
  );
  let deleted = 0;
  for (const a of targets) {
    const res = await ctx.delete(`${SITE}/wiki/rest/api/content/${a.id}`);
    if (res.ok() || res.status() === 204) deleted += 1;
    else process.stdout.write(`delete失敗 ${a.title}: ${res.status()}\n`);
  }
  process.stdout.write(`clear: ${deleted}/${targets.length}件削除\n`);
}

if (disabled !== undefined) {
  const config = JSON.stringify({
    schemaVersion: 1,
    disabled: disabled === 'true',
    ledger: {},
  });
  const res = await ctx.put(`${SITE}/wiki/rest/api/content/${pageId}/child/attachment`, {
    headers: { 'X-Atlassian-Token': 'no-check' },
    multipart: {
      file: {
        name: 'mg_thumbcache_config',
        mimeType: 'application/json',
        buffer: Buffer.from(config),
      },
      minorEdit: 'true',
    },
  });
  process.stdout.write(`config disabled=${disabled}: status=${res.status()}\n`);
}
process.stdout.write(`完了: pageId=${pageId}\n`);
await ctx.dispose();
