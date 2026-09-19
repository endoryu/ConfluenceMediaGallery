/**
 * WU-7 E2E: 性能検証(Phase1_Spec §4 WU-7、V1 §13.2/§13.3)。
 * 条件は環境変数で切り替え、条件ごとに本specを1回実行する:
 *   MG_PERF_PAGE : 対象ページtitle(既定 MG-05-Perf-50)
 *   MG_COND      : 条件ラベル(thumb-on / thumb-off 等。結果ファイル名に入る)
 *   MG_RUNS      : Cold/Warm各回数(既定5)
 * Cold=新規browser context(HTTPキャッシュ空)、Warm=同一contextでreload。
 * ネットワークはLAN実測(スロットリングなし — OOPIF制約はresult.mdに記録)。
 */
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { NetworkRecorder, findPageIdByTitle, openGalleryFrame, saveResult } from '../helpers';

const STORAGE_STATE = 'local/storageState.json';
const PAGE_TITLE = process.env['MG_PERF_PAGE'] ?? 'MG-05-Perf-50';
const COND = process.env['MG_COND'] ?? 'default';
const RUNS = Number(process.env['MG_RUNS'] ?? '5');

/** サイト・media・forge CDN以外への要求がないこと(P0-5同等の不変条件) */
const HOST_ALLOWLIST = [
  'ryu-dev.atlassian.net',
  'api.media.atlassian.com',
  'cdn.prod.atlassian-dev.net',
];

interface LoadSample {
  firstBatchMs: number;
  listCompleteMs: number;
  page1ToBatchMs: number;
  mediaSettleMs: number;
  tileCount: number;
  imgLoaded: number;
  fallbackCount: number;
  cls: number;
  longTasks50: number;
  restRequests: number;
  mediaRequests: number;
  mediaBytes: number;
}

function quantiles(values: number[]): { median: number; p95: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)] ?? 0;
  return { median: at(0.5), p95: at(0.95) };
}

async function measureLoad(page: Page, pageId: string): Promise<LoadSample> {
  const recorder = new NetworkRecorder(page, () => true);
  const frame = await openGalleryFrame(page, pageId, '.mg-grid');
  await expect
    .poll(
      async () =>
        frame.evaluate(() =>
          performance.getEntriesByType('mark').some((m) => m.name === 'p1.gallery.list.complete'),
        ),
      { timeout: 120_000 },
    )
    .toBe(true);
  // src付きimgのロード完了(成功または失敗)まで待つ
  await expect
    .poll(
      async () =>
        frame.evaluate(() => {
          const imgs = [...document.querySelectorAll<HTMLImageElement>('.mg-tile img')].filter(
            (i) => i.getAttribute('src'),
          );
          return imgs.every((i) => i.complete);
        }),
      { timeout: 120_000 },
    )
    .toBe(true);
  await page.waitForTimeout(500);

  const inPage = (await frame.evaluate(() => {
    const marks = new Map(
      performance
        .getEntriesByType('mark')
        .filter((m) => m.name.startsWith('p1.'))
        .map((m) => [m.name, m.startTime]),
    );
    let cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const e = entry as unknown as { value: number; hadRecentInput: boolean };
        if (!e.hadRecentInput) cls += e.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
    let longTasks50 = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (entry.duration > 50) longTasks50 += 1;
    }).observe({ type: 'longtask', buffered: true });
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const media = resources.filter(
      (r) => r.name.includes('api.media.atlassian.com') || r.name.includes('/child/attachment/'),
    );
    const imgs = [...document.querySelectorAll<HTMLImageElement>('.mg-tile img')];
    return new Promise<{
      marks: [string, number][];
      cls: number;
      longTasks50: number;
      mediaSettleMs: number;
      tileCount: number;
      imgLoaded: number;
      fallbackCount: number;
    }>((resolve) => {
      setTimeout(() => {
        resolve({
          marks: [...marks.entries()],
          cls,
          longTasks50,
          mediaSettleMs: media.reduce((max, r) => Math.max(max, r.responseEnd), 0),
          tileCount: document.querySelectorAll('.mg-tile').length,
          imgLoaded: imgs.filter((i) => i.naturalWidth > 0).length,
          fallbackCount: imgs.filter((i) => i.dataset['fallback'] === '1').length,
        });
      }, 100);
    });
  })) as {
    marks: [string, number][];
    cls: number;
    longTasks50: number;
    mediaSettleMs: number;
    tileCount: number;
    imgLoaded: number;
    fallbackCount: number;
  };
  const markMap = new Map(inPage.marks);
  const galleryReqs = recorder.snapshot().filter((r) => r.frameHostPath?.includes('/gallery/'));
  for (const r of galleryReqs) {
    const host = r.hostPath.split('/')[0] ?? '';
    expect(
      HOST_ALLOWLIST.some((h) => host === h || host.endsWith(`.${h}`)),
      `許可外host: ${r.hostPath}`,
    ).toBe(true);
  }
  const mediaReqs = galleryReqs.filter(
    (r) => r.hostPath.includes('api.media.atlassian.com') || r.hostPath.includes('/download'),
  );
  // requestConfluenceはbridgeにより親frameから発行されるため、frame帰属ではなく
  // アプリ固有endpoint署名で数える(一覧/operations/config取得。download 302はmedia側)
  const restReqs = recorder
    .snapshot()
    .filter(
      (r) =>
        /\/wiki\/api\/v2\/(pages\/\d+\/attachments|attachments\/[A-Za-z0-9]+\/(operations|labels))/.test(
          r.hostPath,
        ) ||
        // bridge経由のconfig取得(親frame発行のv1 download。生成停止中はconfigのみ)
        (!r.frameHostPath?.includes('/gallery/') &&
          /\/wiki\/rest\/api\/content\/\d+\/child\/attachment\/[A-Za-z0-9]+\/download/.test(
            r.hostPath,
          )),
    );
  const dcl = markMap.get('p1.gallery.dcl') ?? 0;
  return {
    firstBatchMs: (markMap.get('p1.gallery.tiles.first-batch') ?? 0) - dcl,
    listCompleteMs: (markMap.get('p1.gallery.list.complete') ?? 0) - dcl,
    page1ToBatchMs:
      (markMap.get('p1.gallery.tiles.first-batch') ?? 0) - (markMap.get('p1.gallery.list.page1') ?? 0),
    mediaSettleMs: inPage.mediaSettleMs - dcl,
    tileCount: inPage.tileCount,
    imgLoaded: inPage.imgLoaded,
    fallbackCount: inPage.fallbackCount,
    cls: inPage.cls,
    longTasks50: inPage.longTasks50,
    restRequests: restReqs.length,
    mediaRequests: mediaReqs.length,
    mediaBytes: mediaReqs.reduce((sum, r) => sum + (r.bodyBytes ?? 0), 0),
  };
}

async function newAuthedContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ storageState: STORAGE_STATE });
}

// 通常回帰では実行しない(WU-7計測時に MG_PERF=1 で明示実行)
test.skip(process.env['MG_PERF'] !== '1', 'MG_PERF=1で実行する計測spec');

test(`ロード計測(${PAGE_TITLE} / ${COND})`, async ({ browser, page }) => {
  test.setTimeout(1_800_000);
  const pageId = await findPageIdByTitle(page.request, PAGE_TITLE);
  await page.close();

  const cold: LoadSample[] = [];
  for (let i = 0; i < RUNS; i += 1) {
    const context = await newAuthedContext(browser); // 新規context=キャッシュ空(Cold)
    const p = await context.newPage();
    cold.push(await measureLoad(p, pageId));
    await context.close();
  }

  const warm: LoadSample[] = [];
  const warmContext = await newAuthedContext(browser);
  const warmPage = await warmContext.newPage();
  await measureLoad(warmPage, pageId); // キャッシュ充填(計測外)
  for (let i = 0; i < RUNS; i += 1) {
    warm.push(await measureLoad(warmPage, pageId)); // 再ナビゲーション=Warm
  }
  await warmContext.close();

  const summarize = (samples: LoadSample[]) => ({
    firstBatchMs: quantiles(samples.map((s) => s.firstBatchMs)),
    listCompleteMs: quantiles(samples.map((s) => s.listCompleteMs)),
    page1ToBatchMs: quantiles(samples.map((s) => s.page1ToBatchMs)),
    mediaSettleMs: quantiles(samples.map((s) => s.mediaSettleMs)),
    mediaBytes: quantiles(samples.map((s) => s.mediaBytes)),
    restRequests: quantiles(samples.map((s) => s.restRequests)),
    mediaRequests: quantiles(samples.map((s) => s.mediaRequests)),
  });

  // §13.2/§13.3の判定(全サンプル)
  for (const s of [...cold, ...warm]) {
    expect(s.cls, 'layout shift').toBeLessThan(0.01);
    expect(s.longTasks50, 'long task 50ms超').toBe(0);
    expect(s.page1ToBatchMs).toBeLessThan(500);
  }

  const result = {
    page: PAGE_TITLE,
    cond: COND,
    runs: RUNS,
    cold,
    warm,
    summary: { cold: summarize(cold), warm: summarize(warm) },
  };
  const path = saveResult(`p1-7-perf-${PAGE_TITLE}-${COND}`, result);
  console.log(
    `result: ${path} cold.firstBatch(med)=${result.summary.cold.firstBatchMs.median.toFixed(0)}ms ` +
      `cold.mediaBytes(med)=${result.summary.cold.mediaBytes.median} warm.mediaBytes(med)=${result.summary.warm.mediaBytes.median}`,
  );
});

test(`click同期処理(${PAGE_TITLE})`, async ({ page }) => {
  const pageId = await findPageIdByTitle(page.request, PAGE_TITLE);
  const frame = await openGalleryFrame(page, pageId, '.mg-grid');
  await expect
    .poll(async () => frame.locator('.mg-tile').count(), { timeout: 60_000 })
    .toBeGreaterThan(10);

  // dispatchEventは同期のため、click()前後のperformance.now()差=handler同期コスト
  const durations = (await frame.evaluate(() => {
    const tiles = [...document.querySelectorAll<HTMLButtonElement>('.mg-tile')].slice(0, 20);
    return tiles.map((tile) => {
      const t0 = performance.now();
      tile.click();
      return performance.now() - t0;
    });
  })) as number[];
  const sorted = [...durations].sort((a, b) => a - b);
  const p95 = sorted[Math.ceil(0.95 * sorted.length) - 1] ?? 0;
  expect(p95, 'click handler同期処理P95').toBeLessThan(8);
  saveResult(`p1-7-click-${PAGE_TITLE}`, { durations, p95 });
  console.log(`click p95=${p95.toFixed(2)}ms`);
});
