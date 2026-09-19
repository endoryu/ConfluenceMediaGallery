/**
 * WU-5 E2E: thumbキャッシュ生成・書き戻し(V1 §5.2/§6.3、Phase1_Spec §4 WU-5)。
 * MG_00_Smoke(小規模ページ)でwriterセッションの生成を実測する。
 * - 生成完了(p1.thumbcache.done)後、mg_thumbcache_*とconfigが存在する
 * - 命名規則外への書込みが発生しない(前後の添付一覧比較)
 * - 再ロードでタイルがthumb(data-fallback=0)を使い、転送量が減る
 * - writerには手動操作UI(.mg-admin)が表示される
 */
import { expect, test } from '@playwright/test';
import {
  NetworkRecorder,
  findPageIdByTitle,
  listAttachments,
  openGalleryFrame,
  saveResult,
} from '../helpers';

const SMOKE_PAGE = 'MG_00_Smoke';
const NAME_PATTERN = /^mg_thumbcache_[A-Za-z0-9]+_v\d+_w\d+$/;

test('writerセッションがthumbを生成し、次回ロードでタイルに使われる', async ({ page }) => {
  test.setTimeout(420_000);
  const pageId = await findPageIdByTitle(page.request, SMOKE_PAGE);
  const before = await listAttachments(page.request, pageId);
  const beforeNonCache = before.filter((a) => !a.title.startsWith('mg_thumbcache_'));
  const imageTargets = beforeNonCache.filter((a) => a.mediaType.startsWith('image/'));
  expect(imageTargets.length).toBeGreaterThan(0);

  // 1回目: 生成セッション
  const frame = await openGalleryFrame(page, pageId, '.mg-grid');
  await expect
    .poll(
      async () =>
        frame.evaluate(() =>
          performance.getEntriesByType('mark').some((m) => m.name === 'p1.thumbcache.done'),
        ),
      { timeout: 300_000, intervals: [2000] },
    )
    .toBe(true);

  // 添付の事後確認: 追加は命名規則内のみ、対象imageごとにw320が存在
  const after = await listAttachments(page.request, pageId);
  const added = after.filter((a) => !before.some((b) => b.id === a.id));
  for (const a of added) {
    const withinRule = NAME_PATTERN.test(a.title) || a.title === 'mg_thumbcache_config';
    expect(withinRule, `命名規則外の書込み: ${a.title}`).toBe(true);
  }
  // ユーザーコンテンツが変更されていない(非cache添付のid/versionが不変)
  for (const b of beforeNonCache) {
    const now = after.find((a) => a.id === b.id);
    expect(now, `ユーザー添付が消失: ${b.title}`).toBeTruthy();
    expect(now?.version, `ユーザー添付の版が変化: ${b.title}`).toBe(b.version);
  }
  for (const target of imageTargets) {
    expect(
      after.some((a) => a.title === `mg_thumbcache_${target.id}_v${target.version}_w320`),
      `w320欠落: ${target.id}`,
    ).toBe(true);
  }
  expect(after.some((a) => a.title === 'mg_thumbcache_config')).toBe(true);

  // writer向け手動操作UIの表示(WU-5作業8)
  await expect(frame.locator('.mg-admin button')).toHaveCount(2);

  // 2回目: thumbが使われ、fallbackが消える
  const recorder = new NetworkRecorder(
    page,
    (hostPath) =>
      hostPath.includes('api.media.atlassian.com') || hostPath.includes('/child/attachment/'),
  );
  const frame2 = await openGalleryFrame(page, pageId, '.mg-grid');
  await expect
    .poll(
      async () =>
        frame2.evaluate(() => {
          const imgs = [...document.querySelectorAll<HTMLImageElement>('.mg-tile img')];
          return imgs.length > 0 && imgs.every((i) => i.naturalWidth > 0 || !i.getAttribute('src'));
        }),
      { timeout: 60_000 },
    )
    .toBe(true);
  await page.waitForTimeout(1500);

  const usage = (await frame2.evaluate(() => {
    const imgs = [...document.querySelectorAll<HTMLImageElement>('.mg-tile img')];
    return {
      imgCount: imgs.length,
      thumbCount: imgs.filter((i) => i.dataset['fallback'] === '0').length,
      loaded: imgs.filter((i) => i.naturalWidth > 0).length,
    };
  })) as { imgCount: number; thumbCount: number; loaded: number };
  expect(usage.imgCount).toBeGreaterThan(0);
  expect(usage.thumbCount).toBe(usage.imgCount); // 全imageタイルがthumb使用

  const galleryRequests = recorder
    .snapshot()
    .filter((r) => r.frameHostPath?.includes('/gallery/'));
  const totalBytes = galleryRequests.reduce((sum, r) => sum + (r.bodyBytes ?? 0), 0);

  const path = saveResult('p1-5-thumbcache', {
    pageId,
    imageTargets: imageTargets.length,
    added: added.map((a) => a.title),
    secondLoad: { ...usage, requestCount: galleryRequests.length, totalBytes },
  });
  console.log(
    `result: ${path}, targets=${imageTargets.length}, added=${added.length}, thumbUse=${usage.thumbCount}/${usage.imgCount}, bytes2nd=${totalBytes}`,
  );
});
