/**
 * mg_thumbcache_config(拡張子なしJSON — V1 §5.2)の読取。
 * 正本は命名規則に基づく添付一覧のスキャンであり、configは高速化と設定の器。
 * 壊れていてもnullを返し、呼び出し側は添付スキャンのみで動作を継続する。
 */
import type { BinaryFetcher } from './chunked-fetch';

export interface ThumbcacheLedgerEntry {
  readonly version: number;
  readonly widths: readonly number[];
  /** 生成時刻(ISO 8601) */
  readonly generatedAt?: string;
}

export interface ThumbcacheConfig {
  readonly schemaVersion: number;
  /** ページ単位の生成無効化フラグ(V1 §5.2) */
  readonly disabled: boolean;
  /** 台帳: attachmentId → 生成済みthumbの版・width */
  readonly ledger: Readonly<Record<string, ThumbcacheLedgerEntry>>;
}

export const THUMBCACHE_CONFIG_SCHEMA_VERSION = 1;

export function parseThumbcacheConfig(text: string): ThumbcacheConfig | null {
  try {
    const raw: unknown = JSON.parse(text);
    if (typeof raw !== 'object' || raw === null) return null;
    const obj = raw as Record<string, unknown>;
    if (typeof obj['schemaVersion'] !== 'number') return null;
    if (obj['schemaVersion'] > THUMBCACHE_CONFIG_SCHEMA_VERSION) return null; // 未来schemaは読まない
    const ledger: Record<string, ThumbcacheLedgerEntry> = {};
    const rawLedger = obj['ledger'];
    if (typeof rawLedger === 'object' && rawLedger !== null) {
      for (const [id, value] of Object.entries(rawLedger as Record<string, unknown>)) {
        if (typeof value !== 'object' || value === null) continue;
        const entry = value as Record<string, unknown>;
        if (typeof entry['version'] !== 'number' || !Array.isArray(entry['widths'])) continue;
        const widths = (entry['widths'] as unknown[]).filter(
          (w): w is number => typeof w === 'number',
        );
        ledger[id] = {
          version: entry['version'],
          widths,
          ...(typeof entry['generatedAt'] === 'string'
            ? { generatedAt: entry['generatedAt'] }
            : {}),
        };
      }
    }
    return {
      schemaVersion: obj['schemaVersion'],
      disabled: obj['disabled'] === true,
      ledger,
    };
  } catch {
    return null;
  }
}

/**
 * config添付の内容を取得して解析する。失敗はnull(命名スキャンへfallback)。
 */
export async function loadThumbcacheConfig(
  fetcher: BinaryFetcher,
  configPath: string,
): Promise<ThumbcacheConfig | null> {
  try {
    const result = await fetcher.fetchBinary(configPath);
    if (!result.ok || !result.blob) return null;
    return parseThumbcacheConfig(await result.blob.text());
  } catch {
    return null;
  }
}
