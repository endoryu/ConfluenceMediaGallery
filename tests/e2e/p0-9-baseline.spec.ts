/**
 * WU-9 標準Viewer比較baseline(V1 §15.4)。
 * 標準側: MG-05本文の埋め込み画像click → Confluence標準media viewer。
 *   click→高解像度表示(naturalWidthで判定)、転送bytes、long taskをCold/Warm各5回。
 * probe側: Modal probe(click→DCL/paint)+ viewer内media表示ms(診断JSONから)Warm5回。
 * 条件: 標準側はCDPで100Mbps/50ms throttling+cache制御。probe側(OOPIF)は
 *   CDP throttling/cache制御が届かないため無適用(制約としてresultへ記録)。
 */
import { test } from '@playwright/test';
import type { CDPSession, Frame, Page } from '@playwright/test';
import { NetworkRecorder, findPageIdByTitle, listAttachments, openGalleryFrame, saveResult } from './helpers';

const IMAGES = [
  { file: 'mg05-1080p.jpg', width: 1920 },
  { file: 'mg05-4k.jpg', width: 3840 },
  { file: 'mg05-8k.jpg', width: 7680 },
] as const;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length === 0 ? 0 : s.length % 2 ? (s[m] ?? 0) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
}
function p95(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s.length === 0 ? 0 : (s[Math.min(s.length - 1, Math.ceil(s.length * 0.95) - 1)] ?? 0);
}
const summarize = (v: number[]) => ({ median: Math.round(median(v)), p95: Math.round(p95(v)), n: v.length });

async function setupCdp(page: Page): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  // ガイド§8: 100Mbps / RTT 50ms 相当
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 50,
    downloadThroughput: (100_000_000 / 8),
    uploadThroughput: (100_000_000 / 8),
  });
  return cdp;
}

async function installLongTaskObserver(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __lt?: number };
    w.__lt = 0;
    new PerformanceObserver((list) => {
      w.__lt = (w.__lt ?? 0) + list.getEntries().length;
    }).observe({ type: 'longtask' });
  });
}

async function readLongTasks(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __lt?: number }).__lt ?? 0);
}

async function measureStandardOnce(
  page: Page,
  file: string,
  minWidth: number,
): Promise<{ hiResMs: number }> {
  const embedded = page.locator(`img[src*="${encodeURIComponent(file)}"], img[src*="${file}"]`).first();
  await embedded.scrollIntoViewIfNeeded();
  const t0 = Date.now();
  await embedded.click();
  await page.waitForFunction(
    ({ w }) =>
      [...document.images].some(
        (i) => i.naturalWidth >= w * 0.9 && i.getBoundingClientRect().width > 400,
      ),
    { w: minWidth },
    { timeout: 90_000 },
  );
  const hiResMs = Date.now() - t0;
  await page.keyboard.press('Escape');
  await page
    .waitForFunction(
      ({ w }) =>
        ![...document.images].some(
          (i) => i.naturalWidth >= w * 0.9 && i.getBoundingClientRect().width > 400,
        ),
      { w: minWidth },
      { timeout: 15_000 },
    )
    .catch(() => undefined);
  return { hiResMs };
}

test('WU-9 標準Viewer baseline(Cold/Warm各5回×3画像)', async ({ page, request }) => {
  test.setTimeout(1_500_000);
  const pageId = await findPageIdByTitle(request, 'MG-05-Perf-50');
  const cdp = await setupCdp(page);
  const recorder = new NetworkRecorder(
    page,
    (hp) => hp.includes('media.atlassian.com') || hp.includes('/download/') || hp.includes('/child/attachment/'),
  );
  const results: Record<string, unknown> = {};

  for (const image of IMAGES) {
    const cold: number[] = [];
    const warm: number[] = [];
    let coldLongTasks = 0;
    let bytesStart = recorder.records.length;

    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    for (let i = 0; i < 5; i += 1) {
      await page.goto(`https://ryu-dev.atlassian.net/wiki/pages/viewpage.action?pageId=${pageId}`, {
        waitUntil: 'domcontentloaded',
      });
      await installLongTaskObserver(page);
      const { hiResMs } = await measureStandardOnce(page, image.file, image.width);
      cold.push(hiResMs);
      coldLongTasks += await readLongTasks(page);
    }
    const coldResponses = recorder.records.length - bytesStart;

    await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });
    await page.goto(`https://ryu-dev.atlassian.net/wiki/pages/viewpage.action?pageId=${pageId}`, {
      waitUntil: 'domcontentloaded',
    });
    bytesStart = recorder.records.length;
    for (let i = 0; i < 5; i += 1) {
      const { hiResMs } = await measureStandardOnce(page, image.file, image.width);
      warm.push(hiResMs);
    }
    const warmResponses = recorder.records.length - bytesStart;

    results[image.file] = {
      cold: summarize(cold),
      warm: summarize(warm),
      coldLongTasks,
      coldMediaResponses: coldResponses,
      warmMediaResponses: warmResponses,
    };
    console.log(
      `[標準] ${image.file}: cold med/p95=${summarize(cold).median}/${summarize(cold).p95}ms warm=${summarize(warm).median}/${summarize(warm).p95}ms 応答cold/warm=${coldResponses}/${warmResponses} longtask=${coldLongTasks}`,
    );
  }
  const path = saveResult('p0-9-standard', { results, mediaSample: recorder.snapshot().slice(0, 20) });
  console.log(`result: ${path}`);
});

async function readViewerMediaMs(page: Page): Promise<number | null> {
  const viewerFrame = page.frames().find((f) => f.url().includes('/viewer/'));
  if (!viewerFrame) return null;
  await viewerFrame.locator('button', { hasText: 'JSONを出力' }).click();
  const json = (await viewerFrame.locator('textarea').inputValue()) || '{}';
  const match = json.match(/media表示成立 (\d+)ms/);
  return match?.[1] ? Number(match[1]) : null;
}

async function closeModal(page: Page): Promise<void> {
  const viewerFrame = page.frames().find((f) => f.url().includes('/viewer/'));
  if (viewerFrame) {
    await viewerFrame
      .locator('button[data-action="viewer-close"]')
      .click({ timeout: 10_000 })
      .catch(() => undefined);
  }
  await page.waitForTimeout(800);
}

test('WU-9 probe Viewer baseline(Warm5回×3画像)', async ({ page, request }) => {
  test.setTimeout(1_200_000);
  const pageId = await findPageIdByTitle(request, 'MG-05-Perf-50');
  const attachments = await listAttachments(request, pageId);
  const results: Record<string, unknown> = {};

  for (const image of IMAGES) {
    const att = attachments.find((a) => a.title === image.file);
    if (!att) throw new Error(`attachment not found: ${image.file}`);
    const frame: Frame = await openGalleryFrame(page, pageId);
    const paints: number[] = [];
    const medias: number[] = [];

    for (let i = 0; i < 5; i += 1) {
      await frame
        .locator(`tr:has(td:text-is("${att.id}")) button[data-action="modal"]`)
        .click({ timeout: 15_000 });
      const section = frame.locator('section', { hasText: 'Modal probe:' }).last();
      const readyLine = section.locator('li').filter({ hasText: /viewer-ready/ }).first();
      await readyLine.waitFor({ timeout: 60_000 });
      const text = (await readyLine.textContent()) ?? '';
      const paint = Number(text.match(/click→paint=(\d+)ms/)?.[1] ?? NaN);
      if (Number.isFinite(paint)) paints.push(paint);
      // viewer内のmedia表示msを回収(img load完了を待ってから)
      await page.waitForTimeout(1500);
      const mediaMs = await readViewerMediaMs(page);
      if (mediaMs !== null) medias.push(mediaMs);
      await closeModal(page);
    }
    results[image.file] = { clickToPaint: summarize(paints), viewerMediaLoad: summarize(medias) };
    console.log(
      `[probe] ${image.file}: paint med/p95=${summarize(paints).median}/${summarize(paints).p95}ms media=${summarize(medias).median}/${summarize(medias).p95}ms`,
    );
  }
  const path = saveResult('p0-9-probe', results);
  console.log(`result: ${path}`);
});
