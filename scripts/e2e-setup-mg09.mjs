#!/usr/bin/env node
/**
 * MG-09-Permissions テストページのセットアップ(L3 §1.2。ユーザー委任 2026-09-19)。
 * - ページ作成(既存ならスキップ)
 * - 閲覧制限(readをログインユーザーのみに制限)
 * - 小さなテスト画像を添付
 * 認証は local/storageState.json(ガイド§7.1)。ユーザーコンテンツには触れない。
 */
import process from 'node:process';
import { request } from '@playwright/test';

const SITE = process.env.MG_SITE ?? 'https://ryu-dev.atlassian.net';
const TITLE = 'MG-09-Permissions';

const ctx = await request.newContext({ storageState: 'local/storageState.json' });

const meRes = await ctx.get(`${SITE}/wiki/rest/api/user/current`);
if (!meRes.ok()) throw new Error(`user/current failed: ${meRes.status()}(storageState失効?)`);
const me = await meRes.json();
const accountId = me.accountId;

const searchRes = await ctx.get(
  `${SITE}/wiki/rest/api/content/search?cql=${encodeURIComponent('title="MG_00_Smoke" and type=page')}&expand=space,body.storage`,
);
const search = await searchRes.json();
const spaceKey = search.results?.[0]?.space?.key;
if (!spaceKey) throw new Error('MG_00_Smokeからspaceを特定できない');

// MG-00の本文からMedia Gallery macroのmarkupを複製する(手動配置を不要にする)
const smokeBody = search.results?.[0]?.body?.storage?.value ?? '';
const macroMatch = smokeBody.match(/<ac:adf-extension>[\s\S]*?<\/ac:adf-extension>/);
const macroXml = macroMatch ? macroMatch[0] : '';
if (!macroXml) {
  process.stdout.write('警告: MG-00からmacro markupを抽出できず。macroは手動配置が必要\n');
}

const existingRes = await ctx.get(
  `${SITE}/wiki/rest/api/content/search?cql=${encodeURIComponent(`title="${TITLE}" and type=page`)}`,
);
const existing = await existingRes.json();
let pageId = existing.results?.[0]?.id;

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
          value: `<p>WU-6 P0-5 権限別表示テスト用ページ(閲覧制限つき)。</p>${macroXml}`,
          representation: 'storage',
        },
      },
    },
  });
  if (!createRes.ok()) throw new Error(`page create failed: ${createRes.status()} ${await createRes.text()}`);
  pageId = (await createRes.json()).id;
  process.stdout.write(`ページ作成: ${TITLE}(${pageId})\n`);
}

// 制限が添付作成をブロックするため、upload前に一旦解除する
const clearRes = await ctx.delete(`${SITE}/wiki/rest/api/content/${pageId}/restriction`);
process.stdout.write(`制限解除: status=${clearRes.status()}\n`);

const attListRes = await ctx.get(`${SITE}/wiki/api/v2/pages/${pageId}/attachments`);
const attList = await attListRes.json();
const hasImage = (attList.results ?? []).some((a) => a.title === 'mg09-restricted.png');
if (hasImage) {
  process.stdout.write('添付は既存: mg09-restricted.png\n');
} else {
  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const uploadRes = await ctx.post(`${SITE}/wiki/rest/api/content/${pageId}/child/attachment`, {
    headers: { 'X-Atlassian-Token': 'no-check' },
    multipart: {
      file: {
        name: 'mg09-restricted.png',
        mimeType: 'image/png',
        buffer: Buffer.from(pngBase64, 'base64'),
      },
    },
  });
  process.stdout.write(`添付upload: status=${uploadRes.status()}\n`);
  if (!uploadRes.ok()) {
    process.stdout.write(`  body: ${(await uploadRes.text()).slice(0, 300)}\n`);
  }
}

// upload後にread+update制限を本人のみに設定する
for (const op of ['read', 'update']) {
  const res = await ctx.put(
    `${SITE}/wiki/rest/api/content/${pageId}/restriction/byOperation/${op}/user?accountId=${encodeURIComponent(accountId)}`,
  );
  process.stdout.write(`${op}制限(本人のみ): status=${res.status()}\n`);
}

process.stdout.write(`完了: ${SITE}/wiki/pages/viewpage.action?pageId=${pageId}\n`);
await ctx.dispose();
