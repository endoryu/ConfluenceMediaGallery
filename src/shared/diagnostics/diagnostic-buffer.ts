/**
 * 非永続の診断バッファ(ring buffer)。V1仕様書 §8.4。
 * - 上限は直近 DIAGNOSTIC_BUFFER_LIMIT 件。
 * - 記録先はメモリ内のみ。document破棄とともに消える。
 * - console・Forge・外部へは一切出力しない(CLAUDE.md §8)。
 */
import { DIAGNOSTIC_BUFFER_LIMIT } from '../constants';

export type DiagnosticKind = 'error' | 'unhandledrejection' | 'state' | 'info';

export interface DiagnosticEntry {
  /** epoch ms */
  readonly at: number;
  readonly kind: DiagnosticKind;
  /** 定型化済みメッセージ。除外項目(URL、ファイル名等)を含めない。 */
  readonly message: string;
  readonly stack?: string;
}

export class DiagnosticBuffer {
  private readonly entries: DiagnosticEntry[] = [];

  record(kind: DiagnosticKind, message: string, stack?: string): void {
    const entry: DiagnosticEntry =
      stack === undefined
        ? { at: Date.now(), kind, message }
        : { at: Date.now(), kind, message, stack };
    this.entries.push(entry);
    if (this.entries.length > DIAGNOSTIC_BUFFER_LIMIT) {
      this.entries.splice(0, this.entries.length - DIAGNOSTIC_BUFFER_LIMIT);
    }
  }

  snapshot(): readonly DiagnosticEntry[] {
    return [...this.entries];
  }

  get size(): number {
    return this.entries.length;
  }
}
