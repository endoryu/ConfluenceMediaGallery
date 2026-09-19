/**
 * P0-5(WU-6)CSP/egress/scope の自動計測。
 * - CSP violation・console error・page errorの収集(egress宣言ゼロでの全種別ロード時)
 * - scope upgrade後: users-bulk疎通、G2 write roundtrip(mg_thumbcache_*のみ)
 * - MG-09(閲覧制限ページ、権限あり側)の表示確認
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  NetworkRecorder,
  clickProbeButton,
  findPageIdByTitle,
  listAttachments,
  openGalleryFrame,
  saveResult,
} from './helpers';

interface ConsoleRecord {
  type: string;
  text: string;
  sourceUrl: string;
}

function collectConsole(page: Page): ConsoleRecord[] {
  const records: ConsoleRecord[] = [];
  page.on('console', (msg) => {
    records.push({
      type: msg.type(),
      text: msg.text().slice(0, 500),
      sourceUrl: msg.location().url ?? '',
    });
  });
  page.on('pageerror', (error) => {
    records.push({ type: 'pageerror', text: String(error).slice(0, 500), sourceUrl: '' });
  });
  return records;
}

const isCspViolation = (r: ConsoleRecord): boolean =>
  /Content Security Policy|Refused to load|violates the following/i.test(r.text);

/**
 * 本アプリ起因の判定: 発生元が本アプリのiframe(forge cdn)か、
 * 対象URLがmedia/attachment配信のもの。Confluence本体のCSPノイズ
 * (cloudfront・analytics等)はP0-5の判定対象外として別記録する。
 */
const isFromOurApp = (r: ConsoleRecord): boolean =>
  r.sourceUrl.includes('cdn.prod.atlassian-dev.net') ||
  /media\.atlassian\.com|\/child\/attachment\//.test(r.text);

test('P0-5: egress宣言ゼロで全種別ロード時のCSP violationなし', async ({ page, request }) => {
  const consoleRecords = collectConsole(page);
  const recorder = new NetworkRecorder(
    page,
    (hostPath) => hostPath.includes('media.atlassian.com') || hostPath.includes('/child/attachment/'),
  );

  // 画像(MG-02)
  const imgPageId = await findPageIdByTitle(request, 'MG-02-High-Resolution');
  const imgAtts = await listAttachments(request, imgPageId);
  const imgFrame = await openGalleryFrame(page, imgPageId);
  const smallImage = imgAtts.find((a) => a.mediaType.startsWith('image/') && !a.title.includes('90MB'));
  if (smallImage) {
    await clickProbeButton(imgFrame, smallImage.id, 'thumbnail');
    await imgFrame
      .locator('figcaption')
      .filter({ hasText: /width=320:/ })
      .first()
      .waitFor({ timeout: 60_000 });
  }

  // 動画・音声(MG-03)
  const mediaPageId = await findPageIdByTitle(request, 'MG-03-Video-Audio');
  const mediaAtts = await listAttachments(request, mediaPageId);
  const mediaFrame = await openGalleryFrame(page, mediaPageId);
  const mp3 = mediaAtts.find((a) => a.title === 'MG03-audio.mp3');
  if (mp3) {
    await clickProbeButton(mediaFrame, mp3.id, 'original');
    await mediaFrame
      .locator('li')
      .filter({ hasText: /loadedmetadata/ })
      .first()
      .waitFor({ timeout: 60_000 });
  }

  const allViolations = consoleRecords.filter(isCspViolation);
  const appViolations = allViolations.filter(isFromOurApp);
  const hostNoise = allViolations.filter((r) => !isFromOurApp(r));
  const mediaHosts = [...new Set(recorder.snapshot().map((r) => r.hostPath.split('/')[0]))];
  const path = saveResult('p0-5-csp', { appViolations, hostNoiseCount: hostNoise.length, hostNoiseSample: hostNoise.slice(0, 10), mediaHosts });
  console.log(
    `app起因CSP violations: ${appViolations.length}(Confluence本体ノイズ: ${hostNoise.length}件は対象外), media hosts: ${mediaHosts.join(', ')}(${path})`,
  );
  expect(appViolations).toHaveLength(0);
});

test('P0-5: users-bulk疎通(read:user)', async ({ page, request }) => {
  const pageId = await findPageIdByTitle(request, 'MG_00_Smoke');
  const frame = await openGalleryFrame(page, pageId);

  await frame.locator('button[data-action="users-bulk-probe"]').click();
  const status = frame.locator('button[data-action="users-bulk-probe"] + span');
  await status.filter({ hasText: /成立|失敗|実行不可/ }).waitFor({ timeout: 30_000 });
  const text = (await status.textContent()) ?? '';
  console.log(`users-bulk: ${text}`);
  saveResult('p0-5-users-bulk', { text });
  expect(text).toContain('成立');
});

test('P0-5/P0-8: G2 write roundtrip(mg_thumbcache_*のみ)', async ({ page, request }) => {
  const pageId = await findPageIdByTitle(request, 'MG_00_Smoke');
  const frame = await openGalleryFrame(page, pageId);

  await frame.locator('button[data-action="g2-write-probe"]').click();
  const status = frame.locator('button[data-action="g2-write-probe"] + span');
  await status.filter({ hasText: /roundtrip成立|失敗|生成不可|残存/ }).waitFor({ timeout: 60_000 });
  const text = (await status.textContent()) ?? '';
  console.log(`G2: ${text}`);
  saveResult('p0-8-g2', { text });
  expect(text).toContain('roundtrip成立');
});

test('P0-5: 閲覧制限ページ(MG-09)の権限あり側表示', async ({ page, request }) => {
  const pageId = await findPageIdByTitle(request, 'MG-09-Permissions');
  const frame = await openGalleryFrame(page, pageId);
  const status = frame.locator('p').filter({ hasText: /Attachment/ }).first();
  await status.waitFor({ timeout: 60_000 });
  const text = (await status.textContent()) ?? '';
  console.log(`MG-09: ${text}`);
  saveResult('p0-5-mg09', { text });
  expect(text).toMatch(/Attachment \d+件/);
});
