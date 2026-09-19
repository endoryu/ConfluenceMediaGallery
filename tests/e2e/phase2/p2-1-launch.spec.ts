/**
 * WU-1 E2E: 起動経路とfocus復帰(V1 §7.1/§13.3/§13.4、Phase2_Spec §4 WU-1)。
 * - tile click→Viewer Modalが開き、起動後の最初の処理として画像URLが設定される
 * - 画像はthumbキャッシュ(w640)の正規形URLで実表示される
 * - Forgeヘッダーの閉じるでModalが閉じ、起動元タイルへfocusが復帰する
 */
import { expect, test } from '@playwright/test';
import { findPageIdByTitle, findViewerFrame, openGalleryFrame, saveResult } from '../helpers';

const SMOKE_PAGE = 'MG_00_Smoke';

test('tile clickでViewerが開き、閉じるとfocusが戻る', async ({ page }) => {
  const pageId = await findPageIdByTitle(page.request, SMOKE_PAGE);
  const galleryFrame = await openGalleryFrame(page, pageId, '.mg-grid');
  await expect
    .poll(async () => galleryFrame.locator('.mg-tile').count(), { timeout: 60_000 })
    .toBeGreaterThan(0);
  // セッション正本の確定(§6.1)を待ってからclickする(確定前clickは無視される — WU-1 result参照)
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
  expect(attachmentId).toBeTruthy();
  await firstTile.click();

  // Viewer Modal iframeが開く
  const viewerFrame = await findViewerFrame(page);
  // 起動後の最初の処理=画像URL設定(§13.3)。正規形v1 downloadのみ(§5.2)
  await expect
    .poll(async () => viewerFrame.locator('.mgv-image').getAttribute('src'), { timeout: 30_000 })
    .toMatch(/\/wiki\/rest\/api\/content\/\d+\/child\/attachment\/[A-Za-z0-9]+\/download\?version=\d+$/);
  await expect
    .poll(
      async () =>
        viewerFrame.evaluate(
          () => document.querySelector<HTMLImageElement>('.mgv-image')?.naturalWidth ?? 0,
        ),
      { timeout: 60_000 },
    )
    .toBeGreaterThan(0);

  // marks・起動計測(P0-4方式のdcl/paint delta)
  const marks = (await viewerFrame.evaluate(() =>
    performance
      .getEntriesByType('mark')
      .filter((m) => m.name.startsWith('p2.'))
      .map((m) => m.name),
  )) as string[];
  for (const name of ['p2.viewer.dcl', 'p2.viewer.image-url-set', 'p2.viewer.first-paint']) {
    expect(marks, `mark ${name}`).toContain(name);
  }
  const diag = (await viewerFrame.evaluate(() =>
    (globalThis as unknown as { __MG_DIAG__?: () => { message: string }[] }).__MG_DIAG__?.() ?? [],
  )) as { message: string }[];
  const dclDelta = diag.map((d) => /dclDelta=(\d+)ms/.exec(d.message)?.[1]).find(Boolean);
  const paintDelta = diag.map((d) => /paintDelta=(\d+)ms/.exec(d.message)?.[1]).find(Boolean);
  expect(dclDelta, 'click→dcl計測').toBeTruthy();

  // Forgeヘッダーの閉じるボタン(自前closeは置かない — §7.2)。実DOM名は "Close Modal"
  // Atlaskitヘッダーのoverlayがpointer判定をinterceptするため、
  // キーボード活性化(focus+Enter)→不発ならdirect click eventの順で閉じる
  const closeButton = page.getByRole('button', { name: /close modal|閉じる/i }).first();
  const viewerGone = () => !page.frames().some((f) => f.url().includes('/viewer/'));
  await closeButton.press('Enter').catch(() => undefined);
  try {
    await expect.poll(viewerGone, { timeout: 5_000 }).toBe(true);
  } catch {
    await closeButton.dispatchEvent('click');
  }

  // Modalが閉じ、起動元タイルへfocus復帰(§13.4)
  await expect.poll(viewerGone, { timeout: 30_000 }).toBe(true);
  await expect
    .poll(
      async () =>
        galleryFrame.evaluate(
          () => document.activeElement?.getAttribute('data-attachment-id') ?? '',
        ),
      { timeout: 10_000 },
    )
    .toBe(attachmentId);

  saveResult('p2-1-launch', { pageId, attachmentId, dclDelta, paintDelta, marks });
  console.log(`dclDelta=${dclDelta}ms paintDelta=${paintDelta}ms`);
});
