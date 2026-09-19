/**
 * WU-4 E2E: Thumbnailロード(V1 §6.3、Phase1_Spec §4 WU-4)。
 * MG-05はthumbキャッシュ未生成のため全タイルが原寸fallbackで表示される
 * (thumb使用経路のE2EはWU-5の生成後に確認)。
 * - タイル画像がgallery起点の正規形v1 downloadで取得・表示される
 * - fetchpriority/loading属性が§6.3の3層に従う
 * - 転送・要求数を記録する(thumbあり比較の基準値)
 */
import { expect, test } from '@playwright/test';
import { NetworkRecorder, findPageIdByTitle, openGalleryFrame, saveResult } from '../helpers';

const PERF_PAGE = 'MG-05-Perf-50';

test('タイル画像が原寸fallbackで表示され優先度属性が付与される', async ({ page }) => {
  const recorder = new NetworkRecorder(
    page,
    (hostPath) =>
      hostPath.includes('api.media.atlassian.com') || hostPath.includes('/child/attachment/'),
  );
  const pageId = await findPageIdByTitle(page.request, PERF_PAGE);
  const frame = await openGalleryFrame(page, pageId, '.mg-grid');

  await expect
    .poll(async () => frame.locator('.mg-tile').count(), { timeout: 60_000 })
    .toBeGreaterThanOrEqual(50);
  // 最初のタイル画像が実表示される(naturalWidth>0)まで待つ
  await expect
    .poll(
      async () =>
        frame.evaluate(() => {
          const img = document.querySelector<HTMLImageElement>('.mg-tile img');
          return img ? img.naturalWidth : 0;
        }),
      { timeout: 60_000 },
    )
    .toBeGreaterThan(0);
  await page.waitForTimeout(1500); // eager層のロード進行を待つ

  const info = (await frame.evaluate(() => {
    const imgs = [...document.querySelectorAll<HTMLImageElement>('.mg-tile img')];
    return {
      imgCount: imgs.length,
      loadedCount: imgs.filter((i) => i.naturalWidth > 0).length,
      priorities: imgs.map((i) => i.getAttribute('fetchpriority')),
      lazyNoSrc: imgs.filter((i) => i.loading === 'lazy' && !i.getAttribute('src')).length,
      fallbackCount: imgs.filter((i) => i.dataset['fallback'] === '1').length,
      errorTiles: document.querySelectorAll('.mg-tile[data-error="1"]').length,
    };
  })) as {
    imgCount: number;
    loadedCount: number;
    priorities: (string | null)[];
    lazyNoSrc: number;
    fallbackCount: number;
    errorTiles: number;
  };

  // 画像タイルへimgが割り当てられ、少なくともeager層は表示済み
  expect(info.imgCount).toBeGreaterThanOrEqual(50);
  expect(info.loadedCount).toBeGreaterThan(0);
  expect(info.errorTiles).toBe(0);
  // 3層の優先度が存在する(high層は必ず存在。auto/lowはviewport量に依存)
  expect(info.priorities.filter((p) => p === 'high').length).toBeGreaterThan(0);
  // fallback数=アプリが対応表で有効thumbなしと判定した件数(§6.3。生成進行と競合しない判定)
  const diag = (await frame.evaluate(() =>
    (globalThis as unknown as { __MG_DIAG__?: () => { message: string }[] }).__MG_DIAG__?.() ?? [],
  )) as { message: string }[];
  const matched = Number(
    diag.map((d) => /thumb対応(\d+)件/.exec(d.message)?.[1]).find((v) => v !== undefined) ?? '0',
  );
  expect(info.fallbackCount).toBe(info.imgCount - matched);

  // gallery起点のmedia要求はすべて正規形(§5.2)
  const galleryRequests = recorder
    .snapshot()
    .filter((r) => r.frameHostPath?.includes('/gallery/'));
  expect(galleryRequests.length).toBeGreaterThan(0);
  for (const r of galleryRequests) {
    const canonical =
      /\/wiki\/rest\/api\/content\/[^/]+\/child\/attachment\/[^/]+\/download$/.test(r.hostPath) ||
      r.hostPath.includes('api.media.atlassian.com');
    expect(canonical, `正規形以外のmedia要求: ${r.hostPath}`).toBe(true);
  }
  const totalBytes = galleryRequests.reduce((sum, r) => sum + (r.bodyBytes ?? 0), 0);

  const path = saveResult('p1-4-thumbnail', {
    pageId,
    ...info,
    requestCount: galleryRequests.length,
    totalBytes,
  });
  console.log(
    `result: ${path}, imgs=${info.imgCount}, loaded=${info.loadedCount}, lazyNoSrc=${info.lazyNoSrc}, requests=${galleryRequests.length}, bytes=${totalBytes}`,
  );
});
