/**
 * thumbキャッシュ生成・書き戻し・GC(V1 §5.2/§6.3、Phase1_Spec WU-5)。
 * - 生成はwriterのみ(canUpdateContent)。非writerは静かに原寸fallback継続
 * - ページ単位の無効化フラグ(config)を尊重
 * - 素材: bridge一括→失敗時Range分割4MB×N(上限128MB)→失敗itemはスキップ
 * - 全処理は性能憲法より下位: idle/低優先で逐次(同時1件)、表示をブロックしない
 * - 書込み対象名は命名ガード経由のみ。GC対象は命名parse済みrefのみ
 */
import type { AttachmentWriterApi } from '../../shared/api/confluence-api';
import type { AttachmentSummary } from '../../shared/types/media';
import { THUMBNAIL_WIDTH_CANDIDATES } from '../../shared/constants';
import type { MediaModel, ThumbcacheRef } from '../media-items';
import type { BinaryFetcher } from './chunked-fetch';
import { chunkedFetchBinary } from './chunked-fetch';
import type { ThumbcacheConfig, ThumbcacheLedgerEntry } from './config';
import { THUMBCACHE_CONFIG_SCHEMA_VERSION } from './config';
import type { DownscaleResult } from './downscale';
import { downscaleImageBlob, thumbOutputType } from './downscale';
import { THUMBCACHE_CONFIG_NAME, buildThumbcacheName } from './naming';

export interface ThumbTask {
  readonly item: AttachmentSummary;
  readonly widths: readonly number[];
}

/** 生成対象の列挙(WU-5作業1)。thumb欠落/版ズレのitemを現行版基準で拾う */
export function planThumbWork(
  model: MediaModel,
  widths: readonly number[] = THUMBNAIL_WIDTH_CANDIDATES,
): ThumbTask[] {
  const tasks: ThumbTask[] = [];
  for (const item of model.media) {
    if (item.kind !== 'image') continue; // 動画・音声のthumb生成はPhase 4検討
    const existing = new Set(
      (model.thumbsByTarget.get(item.attachmentId) ?? []).map((t) => t.width),
    );
    const missing = widths.filter((w) => !existing.has(w));
    if (missing.length > 0) tasks.push({ item, widths: missing });
  }
  return tasks;
}

export interface GenerationSummary {
  readonly outcome:
    | 'generated'
    | 'nothing-to-do'
    | 'disabled'
    | 'not-writer'
    | 'claimed-elsewhere'
    | 'aborted';
  readonly generated: number;
  readonly deleted: number;
  readonly skipped: number;
  readonly notes: readonly string[];
}

export interface ThumbcacheGeneratorOptions {
  readonly pageId: string;
  readonly document: Document;
  readonly fetcher: BinaryFetcher;
  readonly writer: AttachmentWriterApi;
  /** 素材の正規形path(site相対)。v1DownloadPathで構築する */
  readonly buildSourcePath: (item: AttachmentSummary) => string;
  /** idle/低優先スケジューラ。既定はrequestIdleCallback(なければsetTimeout) */
  readonly idle?: () => Promise<void>;
  readonly claim?: { acquire(): Promise<boolean>; release(): void };
  readonly downscale?: typeof downscaleImageBlob;
  readonly onDiagnostic?: (kind: 'info' | 'error', message: string) => void;
}

function defaultIdle(): Promise<void> {
  return new Promise((resolve) => {
    const w = globalThis as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void;
    };
    if (typeof w.requestIdleCallback === 'function') {
      w.requestIdleCallback(() => resolve(), { timeout: 2000 });
    } else {
      setTimeout(resolve, 200);
    }
  });
}

const ok = (status: number): boolean => status >= 200 && status < 300;

export class ThumbcacheGenerator {
  private readonly idle: () => Promise<void>;
  private readonly downscale: typeof downscaleImageBlob;

  constructor(private readonly options: ThumbcacheGeneratorOptions) {
    this.idle = options.idle ?? defaultIdle;
    this.downscale = options.downscale ?? downscaleImageBlob;
  }

  /** 生成→GC→config更新の一連。戻り値は診断用summary */
  async run(model: MediaModel, config: ThumbcacheConfig | null): Promise<GenerationSummary> {
    const notes: string[] = [];
    const diag = this.options.onDiagnostic;
    if (config?.disabled) {
      return { outcome: 'disabled', generated: 0, deleted: 0, skipped: 0, notes };
    }
    const tasks = planThumbWork(model);
    const stale = model.staleThumbs;
    if (tasks.length === 0 && stale.length === 0) {
      return { outcome: 'nothing-to-do', generated: 0, deleted: 0, skipped: 0, notes };
    }
    // writer判定は実在attachmentのoperationsで行う(v1 content GETはスコープ外)
    const sampleId = tasks[0]?.item.attachmentId ?? stale[0]?.cacheAttachmentId;
    if (!sampleId || !(await this.options.writer.canUpdateAttachment(sampleId))) {
      return { outcome: 'not-writer', generated: 0, deleted: 0, skipped: 0, notes };
    }
    if (this.options.claim && !(await this.options.claim.acquire())) {
      return { outcome: 'claimed-elsewhere', generated: 0, deleted: 0, skipped: 0, notes };
    }
    try {
      let generated = 0;
      let skipped = 0;
      const ledger: Record<string, ThumbcacheLedgerEntry> = { ...(config?.ledger ?? {}) };
      for (const task of tasks) {
        await this.idle();
        const source = await this.fetchSource(task.item, notes);
        if (!source) {
          skipped += 1;
          continue;
        }
        const outputType = thumbOutputType(task.item.mediaType);
        const written: number[] = [
          ...((ledger[task.item.attachmentId]?.version === task.item.version
            ? ledger[task.item.attachmentId]?.widths
            : undefined) ?? []),
        ];
        let aborted = false;
        for (const width of [...task.widths].sort((a, b) => a - b)) {
          await this.idle();
          const result: DownscaleResult = await this.downscale(
            this.options.document,
            source,
            width,
            outputType,
          );
          if (!result.blob) {
            notes.push(`${task.item.attachmentId}: ${result.note ?? 'decode失敗'}`);
            skipped += 1;
            break;
          }
          // 元画像がbucket以下なら、これより大きいbucketは実質同一のため生成しない
          const name = buildThumbcacheName(task.item.attachmentId, task.item.version, width);
          const up = await this.options.writer.uploadAttachment(
            this.options.pageId,
            name,
            result.blob,
          );
          if (up.status === 401 || up.status === 403) {
            diag?.('info', `thumb生成: 権限なし(status=${up.status})。生成を停止`);
            return { outcome: 'not-writer', generated, deleted: 0, skipped, notes };
          }
          if (!ok(up.status)) {
            notes.push(`${name}: upload失敗 status=${up.status} ${up.note ?? ''}`);
            aborted = true;
            break;
          }
          generated += 1;
          written.push(width);
          if (result.sourceWidth !== undefined && result.sourceWidth <= width) break;
        }
        if (!aborted && written.length > 0) {
          ledger[task.item.attachmentId] = {
            version: task.item.version,
            widths: [...new Set(written)].sort((a, b) => a - b),
            generatedAt: new Date().toISOString(),
          };
        }
      }

      // GC(WU-5作業5): 版ズレ・対象喪失のthumbを削除。対象は命名parse済みrefのみ
      const deleted = await this.deleteRefs(stale, notes);

      // config台帳更新(正本は命名スキャン。壊れても再構築可能 — V1 §5.2)
      await this.writeConfig({ schemaVersion: THUMBCACHE_CONFIG_SCHEMA_VERSION, disabled: false, ledger });

      diag?.(
        'info',
        `thumb生成完了: generated=${generated} deleted=${deleted} skipped=${skipped}`,
      );
      return { outcome: 'generated', generated, deleted, skipped, notes };
    } finally {
      this.options.claim?.release();
    }
  }

  /** 手動操作(WU-5作業8): 全thumbキャッシュ削除+台帳リセット(UI側でwriter限定) */
  async clearAll(model: MediaModel, config: ThumbcacheConfig | null): Promise<number> {
    const notes: string[] = [];
    const refs = [...model.staleThumbs, ...[...model.thumbsByTarget.values()].flat()];
    const deleted = await this.deleteRefs(refs, notes);
    await this.writeConfig({
      schemaVersion: THUMBCACHE_CONFIG_SCHEMA_VERSION,
      disabled: config?.disabled ?? false,
      ledger: {},
    });
    this.options.onDiagnostic?.('info', `thumbキャッシュクリア: deleted=${deleted}`);
    return deleted;
  }

  /** 手動操作(WU-5作業8): ページ単位の生成無効化フラグ(UI側でwriter限定) */
  async setDisabled(config: ThumbcacheConfig | null, disabled: boolean): Promise<boolean> {
    const written = await this.writeConfig({
      schemaVersion: THUMBCACHE_CONFIG_SCHEMA_VERSION,
      disabled,
      ledger: config?.ledger ?? {},
    });
    if (written) {
      this.options.onDiagnostic?.('info', `thumb生成を${disabled ? '無効化' : '有効化'}`);
    }
    return written;
  }

  private async deleteRefs(refs: readonly ThumbcacheRef[], notes: string[]): Promise<number> {
    let deleted = 0;
    for (const ref of refs) {
      await this.idle();
      const res = await this.options.writer.deleteAttachment(ref.cacheAttachmentId);
      if (ok(res.status) || res.status === 204) deleted += 1;
      else notes.push(`GC失敗: ${ref.cacheAttachmentId} status=${res.status}`);
    }
    return deleted;
  }

  private async writeConfig(config: ThumbcacheConfig): Promise<boolean> {
    const blob = new Blob([JSON.stringify(config)], { type: 'application/json' });
    const res = await this.options.writer.uploadAttachment(
      this.options.pageId,
      THUMBCACHE_CONFIG_NAME,
      blob,
    );
    if (!ok(res.status)) {
      this.options.onDiagnostic?.('error', `config書込み失敗: status=${res.status}`);
      return false;
    }
    return true;
  }

  /** 素材取得(WU-5作業3): 一括→Range分割fallback→失敗はnull */
  private async fetchSource(item: AttachmentSummary, notes: string[]): Promise<Blob | null> {
    const path = this.options.buildSourcePath(item);
    try {
      const whole = await this.options.fetcher.fetchBinary(path);
      if (whole.ok && whole.blob) return whole.blob;
    } catch {
      // chunkedへfallback
    }
    const chunked = await chunkedFetchBinary(this.options.fetcher, path);
    if (chunked.blob) return chunked.blob;
    notes.push(`${item.attachmentId}: 素材取得失敗(${chunked.note ?? '-'})`);
    return null;
  }
}
