/**
 * WU-5 E2E: Viewer計測(Phase2_Spec §4 WU-5、V1 §13.3)。
 * MG_PERF=1で実行(通常回帰では skip)。LAN実測+Cold=新規context(P1-E-05裁定)。
 *  1. 起動計測: click(t0)→viewer dcl→画像URL設定→first-paint→Original swap
 *  2. 標準セッション: Viewer 30件ナビのREST・media要求(§4.5.4、Phase 0の157pt対比)
 */
import type { Browser, BrowserContext, Frame, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import {
  NetworkRecorder,
  findPageIdByTitle,
  findViewerFrame,
  openGalleryFrame,
  saveResult,
} from '../helpers';

const STORAGE_STATE = 'local/storageState.json';
const PAGE_TITLE = process.env['MG_PERF_PAGE'] ?? 'MG_00_Smoke';
const RUNS = Number(process.env['MG_RUNS'] ?? '5');

test.skip(process.env['MG_PERF'] !== '1', 'MG_PERF=1で実行する計測spec');

interface LaunchSample {
  dclDeltaMs: number;
  paintDeltaMs: number;
  urlSetMs: number; // viewer dcl→画像URL設定
  stage1Ms: number; // viewer dcl→前段表示(load)
  swapMs: number; // viewer dcl→Original swap
  snapshotBytes: number;
}

function quantiles(values: number[]): { median: number; p95: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) =>
    sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)] ?? 0;
  return { median: at(0.5), p95: at(0.95) };
}

async function waitListComplete(frame: Frame): Promise<void> {
  await expect
    .poll(
      async () =>
        frame.evaluate(() =>
          performance.getEntriesByType('mark').some((m) => m.name === 'p1.gallery.list.complete'),
        ),
      { timeout: 120_000 },
    )
    .toBe(true);
}

async function launchOnce(page: Page, pageId: string): Promise<LaunchSample> {
  const galleryFrame = await openGalleryFrame(page, pageId, '.mg-grid');
  await waitListComplete(galleryFrame);
  await galleryFrame.locator('.mg-tile').first().click();
  const viewerFrame = await findViewerFrame(page);
  await expect
    .poll(
      async () =>
        viewerFrame.evaluate(() =>
          performance.getEntriesByType('mark').some((m) => m.name === 'p2.viewer.original-swap'),
        ),
      { timeout: 60_000 },
    )
    .toBe(true);

  const data = (await viewerFrame.evaluate(() => {
    const marks = new Map(
      performance
        .getEntriesByType('mark')
        .filter((m) => m.name.startsWith('p2.'))
        .map((m) => [m.name, m.startTime]),
    );
    const diag = (
      (globalThis as unknown as { __MG_DIAG__?: () => { message: string }[] }).__MG_DIAG__?.() ??
      []
    ).map((d) => d.message);
    return { marks: [...marks.entries()], diag };
  })) as { marks: [string, number][]; diag: string[] };
  const marks = new Map(data.marks);
  const num = (pattern: RegExp): number =>
    Number(data.diag.map((m) => pattern.exec(m)?.[1]).find(Boolean) ?? -1);
  const dcl = marks.get('p2.viewer.dcl') ?? 0;
  const sample: LaunchSample = {
    dclDeltaMs: num(/dclDelta=(\d+)ms/),
    paintDeltaMs: num(/paintDelta=(\d+)ms/),
    urlSetMs: (marks.get('p2.viewer.image-url-set') ?? 0) - dcl,
    stage1Ms: (marks.get('p2.viewer.stage1-visible') ?? 0) - dcl,
    swapMs: (marks.get('p2.viewer.original-swap') ?? 0) - dcl,
    snapshotBytes: num(/snapshot items=\d+ bytes=(\d+)/),
  };
  // §13.3: 起動後の最初の処理は画像URL設定(first-paintより先)
  expect(marks.get('p2.viewer.image-url-set') ?? 0).toBeLessThanOrEqual(
    marks.get('p2.viewer.first-paint') ?? Number.MAX_VALUE,
  );
  // 閉じる(Esc)
  await viewerFrame.locator('.mgv-viewer').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Escape');
  await expect
    .poll(async () => page.frames().some((f) => f.url().includes('/viewer/')), {
      timeout: 30_000,
    })
    .toBe(false);
  return sample;
}

test(`Viewer起動計測(${PAGE_TITLE})`, async ({ browser, page }) => {
  test.setTimeout(1_800_000);
  const pageId = await findPageIdByTitle(page.request, PAGE_TITLE);
  await page.close();

  const cold: LaunchSample[] = [];
  for (let i = 0; i < RUNS; i += 1) {
    const context: BrowserContext = await (browser as Browser).newContext({
      storageState: STORAGE_STATE,
    });
    const p = await context.newPage();
    cold.push(await launchOnce(p, pageId));
    await context.close();
  }
  const warm: LaunchSample[] = [];
  const warmContext = await (browser as Browser).newContext({ storageState: STORAGE_STATE });
  const warmPage = await warmContext.newPage();
  await launchOnce(warmPage, pageId); // 充填
  for (let i = 0; i < RUNS; i += 1) {
    warm.push(await launchOnce(warmPage, pageId)); // 同一contextで再open(Warm)
  }
  await warmContext.close();

  const summarize = (samples: LaunchSample[]) => ({
    dclDeltaMs: quantiles(samples.map((s) => s.dclDeltaMs)),
    paintDeltaMs: quantiles(samples.map((s) => s.paintDeltaMs)),
    urlSetMs: quantiles(samples.map((s) => s.urlSetMs)),
    stage1Ms: quantiles(samples.map((s) => s.stage1Ms)),
    swapMs: quantiles(samples.map((s) => s.swapMs)),
  });
  const result = {
    page: PAGE_TITLE,
    runs: RUNS,
    cold,
    warm,
    snapshotBytes: cold[0]?.snapshotBytes,
    summary: { cold: summarize(cold), warm: summarize(warm) },
  };
  const path = saveResult(`p2-5-launch-${PAGE_TITLE}`, result);
  console.log(
    `result: ${path} cold.dcl(med)=${result.summary.cold.dclDeltaMs.median}ms ` +
      `warm.dcl(med)=${result.summary.warm.dclDeltaMs.median}ms warm.swap(med)=${result.summary.warm.swapMs.median.toFixed(0)}ms`,
  );
});

test(`標準セッション30件ナビ(${PAGE_TITLE})`, async ({ page }) => {
  test.setTimeout(600_000);
  const recorder = new NetworkRecorder(page, () => true);
  const pageId = await findPageIdByTitle(page.request, PAGE_TITLE);
  const galleryFrame = await openGalleryFrame(page, pageId, '.mg-grid');
  await waitListComplete(galleryFrame);
  await galleryFrame.locator('.mg-tile').first().click();
  const viewerFrame = await findViewerFrame(page);
  await expect
    .poll(async () => viewerFrame.locator('.mgv-image').getAttribute('src'), { timeout: 30_000 })
    .toMatch(/version=\d+$/);
  await viewerFrame.locator('.mgv-viewer').click({ position: { x: 5, y: 5 } });
  const views = Math.min(30, await galleryFrame.locator('.mg-tile').count());
  for (let i = 1; i < views; i += 1) {
    await page.keyboard.press('ArrowRight');
    await expect
      .poll(
        async () =>
          viewerFrame.evaluate(
            (idx) =>
              performance.getEntriesByType('mark').filter((m) => m.name === 'p2.viewer.nav')
                .length >= idx,
            i,
          ),
        { timeout: 30_000 },
      )
      .toBe(true);
    await page.waitForTimeout(150); // 閲覧ペース(§4.5.4の標準セッション相当)
  }
  await page.waitForTimeout(3000); // 終端のOriginal取得を待つ

  const all = recorder.snapshot();
  const rest = all.filter((r) =>
    /\/wiki\/api\/v2\/(pages\/\d+\/attachments|attachments\/[A-Za-z0-9]+\/(operations|labels))/.test(
      r.hostPath,
    ),
  );
  const viewerMedia = all.filter(
    (r) =>
      r.frameHostPath?.includes('/viewer/') &&
      (r.hostPath.includes('api.media.atlassian.com') || r.hostPath.includes('/download')),
  );
  const galleryMedia = all.filter(
    (r) =>
      r.frameHostPath?.includes('/gallery/') &&
      (r.hostPath.includes('api.media.atlassian.com') || r.hostPath.includes('/download')),
  );
  const bytes = (rs: typeof all) => rs.reduce((sum, r) => sum + (r.bodyBytes ?? 0), 0);
  const result = {
    page: PAGE_TITLE,
    views,
    restRequests: rest.length,
    viewerMediaRequests: viewerMedia.length,
    viewerMediaBytes: bytes(viewerMedia),
    galleryMediaRequests: galleryMedia.length,
    galleryMediaBytes: bytes(galleryMedia),
  };
  const path = saveResult(`p2-5-session-${PAGE_TITLE}`, result);
  console.log(
    `result: ${path} views=${views} rest=${rest.length} viewerMedia=${viewerMedia.length}/${bytes(viewerMedia)}B`,
  );
});
