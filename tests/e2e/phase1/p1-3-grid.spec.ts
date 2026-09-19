/**
 * WU-3 E2E: グリッドとタイル(V1 §6.2、Phase1_Spec §4 WU-3)。
 * - CSS Grid、4:3比率枠、220px design token
 * - layout shift(hadRecentInputなし)とアプリ起因long taskの計測(50件。200件はWU-7)
 * - タイル操作(click/Enter/Space)が同期完了しエラーを出さない
 */
import { expect, test } from '@playwright/test';
import { findPageIdByTitle, openGalleryFrame, saveResult } from '../helpers';

const PERF_PAGE = 'MG-05-Perf-50';

test('グリッドが§6.2を満たしCLS/long task 0で描画される', async ({ page }) => {
  const pageId = await findPageIdByTitle(page.request, PERF_PAGE);
  const frame = await openGalleryFrame(page, pageId, '.mg-grid');

  // buffered observerで過去分を含むlayout-shift/longtaskを採取する
  await frame.evaluate(() => {
    const w = window as unknown as {
      __mgShifts: { value: number; hadRecentInput: boolean }[];
      __mgLongTasks: { duration: number }[];
    };
    w.__mgShifts = [];
    w.__mgLongTasks = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const e = entry as unknown as { value: number; hadRecentInput: boolean };
        w.__mgShifts.push({ value: e.value, hadRecentInput: e.hadRecentInput });
      }
    }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        w.__mgLongTasks.push({ duration: entry.duration });
      }
    }).observe({ type: 'longtask', buffered: true });
  });

  await expect
    .poll(async () => frame.locator('.mg-tile').count(), { timeout: 60_000 })
    .toBeGreaterThanOrEqual(50);
  // 順序確定まで待つ(reorderの分も計測へ含める)
  await expect
    .poll(
      async () =>
        frame.evaluate(() =>
          performance.getEntriesByType('mark').some((m) => m.name === 'p1.gallery.list.complete'),
        ),
      { timeout: 60_000 },
    )
    .toBe(true);
  await page.waitForTimeout(500); // observer flush待ち

  // CSS Grid + design token(§6.2)
  const gridInfo = await frame.evaluate(() => {
    const grid = document.querySelector('.mg-grid');
    const tile = document.querySelector('.mg-tile');
    if (!grid || !tile) return null;
    const gridStyle = getComputedStyle(grid);
    const tileBox = tile.getBoundingClientRect();
    return {
      display: gridStyle.display,
      token: getComputedStyle(document.documentElement).getPropertyValue('--mg-tile-min').trim(),
      tileWidth: tileBox.width,
      tileRatio: tileBox.width / tileBox.height,
    };
  });
  expect(gridInfo?.display).toBe('grid');
  expect(gridInfo?.token).toBe('220px');
  expect(gridInfo?.tileWidth ?? 0).toBeGreaterThanOrEqual(219); // 最小幅220(丸め誤差許容)
  expect(Math.abs((gridInfo?.tileRatio ?? 0) - 4 / 3)).toBeLessThan(0.02); // 4:3比率枠

  // タイル操作: click/Enter/Space(§6.2)。エラーなく同期完了する
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const tile = frame.locator('.mg-tile').first();
  await tile.click();
  await tile.press('Enter');
  await tile.press('Space');
  expect(pageErrors).toEqual([]);

  const perf = (await frame.evaluate(() => {
    const w = window as unknown as {
      __mgShifts: { value: number; hadRecentInput: boolean }[];
      __mgLongTasks: { duration: number }[];
    };
    return { shifts: w.__mgShifts, longTasks: w.__mgLongTasks };
  })) as { shifts: { value: number; hadRecentInput: boolean }[]; longTasks: { duration: number }[] };

  // 比率枠先行確保によりタイル起因のlayout shiftなし(操作起因は除外)
  const cls = perf.shifts
    .filter((s) => !s.hadRecentInput)
    .reduce((sum, s) => sum + s.value, 0);
  expect(cls).toBeLessThan(0.01);
  // アプリ起因long task 50ms超が0(50件時点。200件はWU-7)
  expect(perf.longTasks.filter((t) => t.duration > 50)).toEqual([]);

  const tileCount = await frame.locator('.mg-tile').count();
  const path = saveResult('p1-3-grid', { pageId, tileCount, gridInfo, ...perf, cls });
  console.log(`result: ${path}, tiles=${tileCount}, cls=${cls.toFixed(4)}, longTasks=${perf.longTasks.length}`);
});
