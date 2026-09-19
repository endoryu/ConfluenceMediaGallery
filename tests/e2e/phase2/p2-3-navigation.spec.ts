/**
 * WU-3 E2E: ナビゲーション(V1 §7.3、Phase2_Spec §4 WU-3)。
 * 前後ボタン/Arrow/Escの実機動作、端の無効化、Esc→close→focus復帰。
 */
import { expect, test } from '@playwright/test';
import { findPageIdByTitle, findViewerFrame, openGalleryFrame } from '../helpers';

const SMOKE_PAGE = 'MG_00_Smoke';

test('前後移動・Arrow・Escが§7.3どおり動作する', async ({ page }) => {
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
  const currentSrc = () => viewerFrame.locator('.mgv-image').getAttribute('src');
  await expect.poll(currentSrc, { timeout: 30_000 }).toMatch(/\/download\?version=\d+$/);
  const src0 = await currentSrc();

  // 先頭では前へが無効(§7.3)
  await expect(viewerFrame.locator('.mgv-nav--prev')).toBeDisabled();
  await expect(viewerFrame.locator('.mgv-nav--next')).toBeEnabled();

  // 次へボタン→2枚目
  await viewerFrame.locator('.mgv-nav--next').click();
  await expect.poll(currentSrc, { timeout: 30_000 }).not.toBe(src0);
  const src1 = await currentSrc();
  await expect(viewerFrame.locator('.mgv-nav--prev')).toBeEnabled();

  // ArrowRight→3枚目、ArrowLeft→2枚目へ戻る(直前表示=decode済みの逆移動)
  await viewerFrame.locator('.mgv-viewer').click({ position: { x: 5, y: 5 } }); // frameへfocus
  await page.keyboard.press('ArrowRight');
  await expect.poll(currentSrc, { timeout: 30_000 }).not.toBe(src1);
  await page.keyboard.press('ArrowLeft');
  await expect.poll(currentSrc, { timeout: 30_000 }).toBe(src1);
  // 画像のalt=title(§13.4)
  expect(await viewerFrame.locator('.mgv-image').getAttribute('alt')).toMatch(/.+/);

  // Esc→自前handlerでclose(§7.3)→focus復帰(§13.4)
  await page.keyboard.press('Escape');
  await expect
    .poll(async () => page.frames().some((f) => f.url().includes('/viewer/')), { timeout: 30_000 })
    .toBe(false);
  await expect
    .poll(
      async () =>
        galleryFrame.evaluate(
          () => document.activeElement?.getAttribute('data-attachment-id') ?? '',
        ),
      { timeout: 10_000 },
    )
    .toBe(attachmentId);
});
