/**
 * WU-7(P0-6)標準セッションprobeとpage size比較probe。
 * - 標準セッション: 一覧50件中30件を「メディア表示+詳細+更新者」で再現し、
 *   REST回数(adapter stats)とメディアロード時間を記録する(V1 §4.5.4の実測)
 * - page size比較: limit 25/50/100/250で「最初のページ」「全件取得」を各3回計測
 * 結果は<pre>へJSON表示(E2Eが収集)し、要約を診断バッファへ記録する。
 */
import type { ConfluenceApi } from '../../shared/api/confluence-api';
import type { CachingConfluenceApi } from '../../shared/api/caching-confluence-api';
import type { DiagnosticBuffer } from '../../shared/diagnostics/diagnostic-buffer';
import type { AttachmentSummary } from '../../shared/types/media';
import { PAGE_SIZE_CANDIDATES, STANDARD_SESSION_VIEW_COUNT } from '../../shared/constants';
import type { ImageLoader } from './probe-dom';
import { nativeImageLoader } from './probe-dom';

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length === 0
    ? 0
    : sorted.length % 2
      ? (sorted[mid] ?? 0)
      : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function p95(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
}

export interface StandardSessionDeps {
  readonly api: CachingConfluenceApi;
  readonly diagnostics: DiagnosticBuffer;
  readonly loadImage?: ImageLoader;
  readonly savingsEnabled: boolean;
}

export async function runStandardSessionProbe(
  container: HTMLElement,
  items: readonly AttachmentSummary[],
  deps: StandardSessionDeps,
): Promise<void> {
  const doc = container.ownerDocument;
  const loader = deps.loadImage ?? nativeImageLoader;
  const { api, diagnostics } = deps;
  const targets = items.slice(0, STANDARD_SESSION_VIEW_COUNT);

  const section = doc.createElement('section');
  const heading = doc.createElement('h3');
  heading.textContent = `標準セッションprobe(${targets.length}件、savings=${deps.savingsEnabled})`;
  const status = doc.createElement('p');
  status.textContent = '実行中…';
  const pre = doc.createElement('pre');
  pre.dataset['probe'] = 'standard-session';
  section.append(heading, status, pre);
  container.append(section);

  const statsBefore = { ...api.stats };
  const started = performance.now();
  const itemTimes: number[] = [];
  const mediaTimes: number[] = [];
  let mediaLoads = 0;
  let mediaErrors = 0;

  for (const item of targets) {
    const itemStart = performance.now();
    // §4.5.3: メディア要求を先に発行し、詳細と更新者はバックグラウンド相当で続行
    const url = api.thumbnailUrl(item.attachmentId, item.version, 640);
    const detailPromise = api.getAttachment(item.attachmentId, { includeLabels: true });
    const load = await loader(doc, url);
    mediaLoads += 1;
    if (!load.ok) mediaErrors += 1;
    else mediaTimes.push(load.loadMs);
    const detail = await detailPromise.catch(() => null);
    if (detail?.authorId) {
      await api.resolveUsers([detail.authorId]).catch(() => []);
    }
    itemTimes.push(performance.now() - itemStart);
    status.textContent = `実行中… ${itemTimes.length}/${targets.length}`;
  }

  const result = {
    savingsEnabled: deps.savingsEnabled,
    viewCount: targets.length,
    totalMs: Math.round(performance.now() - started),
    perItemMs: { median: Math.round(median(itemTimes)), p95: Math.round(p95(itemTimes)) },
    mediaLoadMs: { median: Math.round(median(mediaTimes)), p95: Math.round(p95(mediaTimes)) },
    mediaLoads,
    mediaErrors,
    restDelta: {
      listCalls: api.stats.listCalls - statsBefore.listCalls,
      detailCalls: api.stats.detailCalls - statsBefore.detailCalls,
      userCalls: api.stats.userCalls - statsBefore.userCalls,
      dedupeHits: api.stats.dedupeHits - statsBefore.dedupeHits,
      cacheHits: api.stats.cacheHits - statsBefore.cacheHits,
    },
    statsTotal: { ...api.stats },
  };
  pre.textContent = JSON.stringify(result, null, 2);
  status.textContent = `完了: total ${result.totalMs}ms`;
  diagnostics.record(
    'info',
    `standard-session: total=${result.totalMs}ms item(med/p95)=${result.perItemMs.median}/${result.perItemMs.p95}ms REST(list/detail/users)=${result.restDelta.listCalls}/${result.restDelta.detailCalls}/${result.restDelta.userCalls} media=${mediaLoads}(err=${mediaErrors})`,
  );
}

export interface PageSizeDeps {
  /** キャッシュを介さないAPI(素のForge adapter) */
  readonly rawApi: ConfluenceApi;
  readonly pageId: string;
  readonly diagnostics: DiagnosticBuffer;
}

export async function runPageSizeProbe(container: HTMLElement, deps: PageSizeDeps): Promise<void> {
  const doc = container.ownerDocument;
  const section = doc.createElement('section');
  const heading = doc.createElement('h3');
  heading.textContent = 'page size比較probe(25/50/100/250 × 3回)';
  const status = doc.createElement('p');
  status.textContent = '実行中…';
  const pre = doc.createElement('pre');
  pre.dataset['probe'] = 'page-size';
  section.append(heading, status, pre);
  container.append(section);

  const rows: {
    limit: number;
    run: number;
    firstPageMs: number;
    totalMs: number;
    requests: number;
    items: number;
  }[] = [];

  for (const limit of PAGE_SIZE_CANDIDATES) {
    for (let run = 1; run <= 3; run += 1) {
      const started = performance.now();
      let firstPageMs = 0;
      let requests = 0;
      let itemCount = 0;
      let cursor: string | undefined;
      do {
        const page = await deps.rawApi.listAttachments(deps.pageId, cursor, limit);
        requests += 1;
        itemCount += page.items.length;
        if (requests === 1) firstPageMs = performance.now() - started;
        cursor = page.nextCursor;
      } while (cursor !== undefined);
      rows.push({
        limit,
        run,
        firstPageMs: Math.round(firstPageMs),
        totalMs: Math.round(performance.now() - started),
        requests,
        items: itemCount,
      });
      status.textContent = `実行中… limit=${limit} run=${run}`;
    }
  }

  const summary = PAGE_SIZE_CANDIDATES.map((limit) => {
    const subset = rows.filter((r) => r.limit === limit);
    return {
      limit,
      firstPageMsMedian: Math.round(median(subset.map((r) => r.firstPageMs))),
      totalMsMedian: Math.round(median(subset.map((r) => r.totalMs))),
      requests: subset[0]?.requests ?? 0,
      items: subset[0]?.items ?? 0,
    };
  });
  pre.textContent = JSON.stringify({ rows, summary }, null, 2);
  status.textContent = '完了';
  deps.diagnostics.record(
    'info',
    `page-size: ${summary.map((s) => `limit${s.limit}: first=${s.firstPageMsMedian}ms total=${s.totalMsMedian}ms req=${s.requests}`).join(' / ')}`,
  );
}
