#!/usr/bin/env node
/**
 * MG-05-Perf-50 テストページのセットアップ(L3 §1.2。ユーザー委任の自律実行)。
 * local/mg05/ の50画像をPUT(create-or-update、冪等)で添付し、macroを配置する。
 */
import { readdirSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { request } from '@playwright/test';

const SITE = process.env.MG_SITE ?? 'https://ryu-dev.atlassian.net';
const TITLE = 'MG-05-Perf-50';
const MEDIA_DIR = 'local/mg05';

const ctx = await request.newContext({ storageState: 'local/storageState.json' });

const searchRes = await ctx.get(
  `${SITE}/wiki/rest/api/content/search?cql=${encodeURIComponent('title="MG_00_Smoke" and type=page')}&expand=space,body.storage`,
);
const search = await searchRes.json();
const spaceKey = search.results?.[0]?.space?.key;
if (!spaceKey) throw new Error('MG_00_Smokeからspaceを特定できない');
const smokeBody = search.results?.[0]?.body?.storage?.value ?? '';
const macroXml = smokeBody.match(/<ac:adf-extension>[\s\S]*?<\/ac:adf-extension>/)?.[0] ?? '';

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
          value: `<p>WU-7/WU-9 標準セッション・比較計測用(50 attachments)。</p>${macroXml}`,
          representation: 'storage',
        },
      },
    },
  });
  if (!createRes.ok()) throw new Error(`page create failed: ${createRes.status()}`);
  pageId = (await createRes.json()).id;
  process.stdout.write(`ページ作成: ${TITLE}(${pageId})\n`);
}

const attListRes = await ctx.get(`${SITE}/wiki/api/v2/pages/${pageId}/attachments?limit=250`);
const existingTitles = new Set(((await attListRes.json()).results ?? []).map((a) => a.title));

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
  if (uploaded % 10 === 0) process.stdout.write(`upload ${uploaded}/${files.length}…\n`);
}
process.stdout.write(`完了: upload=${uploaded} skip=${skipped}(全${files.length}件)pageId=${pageId}\n`);

// WU-9: 標準プレビュー計測用に代表画像3枚を本文へ埋め込む(冪等)
const pageRes = await ctx.get(`${SITE}/wiki/rest/api/content/${pageId}?expand=body.storage,version`);
const pageJson = await pageRes.json();
const body = pageJson.body?.storage?.value ?? '';
if (body.includes('mg05-8k.jpg')) {
  process.stdout.write('埋め込み画像は既存\n');
} else {
  const imgs = ['mg05-1080p.jpg', 'mg05-4k.jpg', 'mg05-8k.jpg']
    .map((f) => `<p><ac:image ac:width="240"><ri:attachment ri:filename="${f}" /></ac:image></p>`)
    .join('');
  const putRes = await ctx.put(`${SITE}/wiki/rest/api/content/${pageId}`, {
    data: {
      id: pageId,
      type: 'page',
      title: TITLE,
      space: { key: spaceKey },
      body: { storage: { value: body + imgs, representation: 'storage' } },
      version: { number: (pageJson.version?.number ?? 1) + 1 },
    },
  });
  process.stdout.write(`埋め込み画像追加: status=${putRes.status()}\n`);
}
await ctx.dispose();
