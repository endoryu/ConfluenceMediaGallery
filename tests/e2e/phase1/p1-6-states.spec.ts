/**
 * WU-6 E2E: hoverタイトル・状態表示(V1 §6.4/§11、Phase1_Spec §4 WU-6)。
 * - hover/:focus-visibleでタイトルが即時表示、非hoverでは非表示
 * - 空ページ(MG-10-Empty)で空状態メッセージ
 * - gallery bundle起因のconsole出力0(§8)
 */
import { expect, test } from '@playwright/test';
import { findPageIdByTitle, openGalleryFrame, saveResult } from '../helpers';

const PERF_PAGE = 'MG-05-Perf-50';
const EMPTY_PAGE = 'MG-10-Empty';

test('hover/focus-visibleでタイトルが表示される(§6.4)', async ({ page }) => {
  const consoleFromGallery: string[] = [];
  page.on('console', (message) => {
    if (message.location().url.includes('/gallery/')) {
      consoleFromGallery.push(`${message.type()}: ${message.text()}`);
    }
  });

  const pageId = await findPageIdByTitle(page.request, PERF_PAGE);
  const frame = await openGalleryFrame(page, pageId, '.mg-grid');
  await expect
    .poll(async () => frame.locator('.mg-tile').count(), { timeout: 60_000 })
    .toBeGreaterThanOrEqual(50);

  const first = frame.locator('.mg-tile').first();
  const title = first.locator('.mg-tile-title');

  // 非hover時は不可視、タイトル要素自体は存在(初回DOM生成時から)
  await expect(title).toHaveCount(1);
  expect(await title.evaluate((el) => getComputedStyle(el).visibility)).toBe('hidden');

  // pointer hoverで即時表示
  await first.hover();
  expect(await title.evaluate((el) => getComputedStyle(el).visibility)).toBe('visible');
  // 1行ellipsis
  expect(await title.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe('nowrap');
  expect(await title.evaluate((el) => getComputedStyle(el).textOverflow)).toBe('ellipsis');

  // hover解除で非表示(OOPIF内で別タイルへ移動)、キーボードfocus(:focus-visible)で表示
  const other = frame.locator('.mg-tile').nth(5);
  await other.hover();
  await expect
    .poll(async () => title.evaluate((el) => getComputedStyle(el).visibility), { timeout: 5000 })
    .toBe('hidden');
  expect(
    await other.locator('.mg-tile-title').evaluate((el) => getComputedStyle(el).visibility),
  ).toBe('visible');
  await first.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab'); // キーボード操作でfocus-visibleを立てる
  const focusedTitleVisible = await frame.evaluate(() => {
    const tile = document.activeElement;
    const t = tile?.querySelector('.mg-tile-title');
    return t ? getComputedStyle(t).visibility : 'none';
  });
  expect(focusedTitleVisible).toBe('visible');

  expect(consoleFromGallery, 'gallery起因のconsole出力').toEqual([]);
  saveResult('p1-6-states-hover', { pageId, focusedTitleVisible });
});

test('空ページは空状態メッセージを表示する(§11)', async ({ page }) => {
  const pageId = await findPageIdByTitle(page.request, EMPTY_PAGE);
  const frame = await openGalleryFrame(page, pageId, '.mg-grid');
  await expect(frame.locator('.mg-status')).toHaveText('表示できる画像・動画・音声はありません', {
    timeout: 60_000,
  });
  expect(await frame.locator('.mg-tile').count()).toBe(0);
  const state = await frame.locator('.mg-status').getAttribute('data-state');
  expect(state).toBe('empty');
  saveResult('p1-6-states-empty', { pageId, state });
});
