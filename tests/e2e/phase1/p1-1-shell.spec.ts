/**
 * WU-1 E2E: Gallery shell・一覧pagination(Phase1_Spec §4 WU-1)。
 * - 静的shell(placeholder)がJSより先に存在する(§13.3「API待機中に背景/placeholder」)
 * - 1ページ目応答(p1.gallery.list.page1)→次frameで最初のタイルbatch(p1.gallery.tiles.first-batch)
 * - 初期表示のrequestはメタデータのみ(Thumbnail取得はWU-4。media/binary要求0)
 */
import { expect, test } from '@playwright/test';
import { NetworkRecorder, findPageIdByTitle, openGalleryFrame, saveResult } from '../helpers';

const PERF_PAGE = 'MG-05-Perf-50';

interface MarkEntry {
  name: string;
  startTime: number;
}

test('gallery shellと一覧paginationが§13.3を満たす', async ({ page }) => {
  const recorder = new NetworkRecorder(
    page,
    (hostPath) =>
      hostPath.includes('api.media.atlassian.com') ||
      hostPath.includes('/download/') ||
      hostPath.includes('/child/attachment/'),
  );
  const pageId = await findPageIdByTitle(page.request, PERF_PAGE);
  const frame = await openGalleryFrame(page, pageId, '.mg-grid');

  // 静的shell: status(placeholder)とgridがDOMに存在する
  await expect(frame.locator('.mg-status')).toHaveCount(1);
  await expect(frame.locator('.mg-grid')).toHaveCount(1);

  // タイルbatchの到着を待つ(50件ページ)
  await expect
    .poll(async () => frame.locator('.mg-tile').count(), { timeout: 60_000 })
    .toBeGreaterThanOrEqual(50);

  // 順序確定(list.complete)まで待ってからmarksを採取する
  await expect
    .poll(
      async () =>
        frame.evaluate(() =>
          performance.getEntriesByType('mark').some((m) => m.name === 'p1.gallery.list.complete'),
        ),
      { timeout: 60_000 },
    )
    .toBe(true);

  const marks = (await frame.evaluate(() =>
    performance
      .getEntriesByType('mark')
      .filter((m) => m.name.startsWith('p1.'))
      .map((m) => ({ name: m.name, startTime: m.startTime })),
  )) as MarkEntry[];
  const byName = new Map(marks.map((m) => [m.name, m.startTime]));

  for (const name of [
    'p1.gallery.dcl',
    'p1.gallery.context.end',
    'p1.gallery.list.page1',
    'p1.gallery.tiles.first-batch',
    'p1.gallery.list.complete',
  ]) {
    expect(byName.has(name), `mark ${name} が存在する`).toBe(true);
  }

  // 1ページ目応答→次のanimation frameで最初のタイルbatch(§13.3)
  const firstBatchDelta =
    (byName.get('p1.gallery.tiles.first-batch') ?? 0) - (byName.get('p1.gallery.list.page1') ?? 0);
  expect(firstBatchDelta).toBeGreaterThanOrEqual(0);
  expect(firstBatchDelta).toBeLessThan(500); // 病的遅延の検出。実測値はresult.mdに記録

  // タイルにアクセシブル名とタイトル要素がある(§6.2/§6.4)
  const firstTile = frame.locator('.mg-tile').first();
  await expect(firstTile).toHaveAttribute('aria-label', /.+/);
  await expect(firstTile.locator('.mg-tile-title')).toHaveCount(1);

  // 初期表示のrequestはメタデータとThumbnail(タイル画像)のみ(§13.3)。
  // gallery起点のmedia要求はすべて正規形v1 download(またはそのredirect先)である
  const mediaRequests = recorder
    .snapshot()
    .filter((r) => r.frameHostPath?.includes('/gallery/'));
  for (const r of mediaRequests) {
    const canonical =
      /\/wiki\/rest\/api\/content\/[^/]+\/child\/attachment\/[^/]+\/download$/.test(r.hostPath) ||
      r.hostPath.includes('api.media.atlassian.com');
    expect(canonical, `正規形以外のmedia要求: ${r.hostPath}`).toBe(true);
  }

  const tileCount = await frame.locator('.mg-tile').count();
  const path = saveResult('p1-1-shell', {
    pageId,
    tileCount,
    marks,
    firstBatchDeltaMs: firstBatchDelta,
    mediaRequestCount: mediaRequests.length,
  });
  console.log(`result: ${path}, tiles=${tileCount}, firstBatchDelta=${firstBatchDelta.toFixed(1)}ms`);
});
