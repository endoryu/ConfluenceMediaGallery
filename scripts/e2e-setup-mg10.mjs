#!/usr/bin/env node
/**
 * MG-10-Empty テストページのセットアップ(WU-6 空状態確認用。冪等)。
 * macroのみ配置し、添付は置かない。
 */
import process from 'node:process';
import { request } from '@playwright/test';

const SITE = process.env.MG_SITE ?? 'https://ryu-dev.atlassian.net';
const TITLE = 'MG-10-Empty';

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
          value: `<p>WU-6 空状態確認用(添付なし)。</p>${macroXml}`,
          representation: 'storage',
        },
      },
    },
  });
  if (!createRes.ok()) throw new Error(`page create failed: ${createRes.status()}`);
  pageId = (await createRes.json()).id;
  process.stdout.write(`ページ作成: ${TITLE}(${pageId})\n`);
}
process.stdout.write(`完了: pageId=${pageId}\n`);
await ctx.dispose();
