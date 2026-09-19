/**
 * WU-2 E2E: 画像2段表示(V1 §7.4、Phase2_Spec §4 WU-2)。
 * thumb(w640)→Original swapが実機で成立し、swap後も正規形URLのみであること。
 */
import { expect, test } from '@playwright/test';
import { findPageIdByTitle, findViewerFrame, openGalleryFrame } from '../helpers';

const SMOKE_PAGE = 'MG_00_Smoke';

test('thumb表示→Originalへ次frameでswapされる', async ({ page }) => {
  const pageId = await findPageIdByTitle(page.request, SMOKE_PAGE);
  const galleryFrame = await openGalleryFrame(page, pageId, '.mg-grid');
  await expect
    .poll(
      async () =>
        galleryFrame.evaluate(() =>
          performance.getEntriesByType('mark').some((m) => m.name === 'p1.gallery.list.complete'),
        ),
      { timeout: 60_000 },
    )
    .toBe(true);

  const firstTile = galleryFrame.locator('.mg-tile').first();
  const attachmentId = await firstTile.getAttribute('data-attachment-id');
  await firstTile.click();
  const viewerFrame = await findViewerFrame(page);

  // 前段はthumbキャッシュ(mg_thumbcache_*のcache添付、id≠元attachment)
  await expect
    .poll(async () => viewerFrame.locator('.mgv-image').getAttribute('src'), { timeout: 30_000 })
    .toMatch(/\/child\/attachment\/[A-Za-z0-9]+\/download\?version=\d+$/);

  // Original swap(§7.4)。swap後のsrcは元attachmentの正規形
  await expect
    .poll(
      async () =>
        viewerFrame.evaluate(() =>
          performance.getEntriesByType('mark').some((m) => m.name === 'p2.viewer.original-swap'),
        ),
      { timeout: 60_000 },
    )
    .toBe(true);
  const finalSrc = await viewerFrame.locator('.mgv-image').getAttribute('src');
  expect(finalSrc).toContain(`/child/attachment/${attachmentId}/download`);
  // swap後も実表示が維持されている(前段→確定の差し替えで空白にならない — §13.3)
  expect(
    await viewerFrame.evaluate(
      () => document.querySelector<HTMLImageElement>('.mgv-image')?.naturalWidth ?? 0,
    ),
  ).toBeGreaterThan(0);
  // エラーfallbackは出ていない
  expect(await viewerFrame.locator('.mgv-status[data-state="error"]').count()).toBe(0);
});
