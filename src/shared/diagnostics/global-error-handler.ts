/**
 * global error handler(V1仕様書 §8.4)。
 * - `error` event と `unhandledrejection` を捕捉し、診断バッファへ記録するだけ。
 * - console を呼ばない。再throwしない(CLAUDE.md §8)。
 * - メッセージは定型化し、URL・ファイル名等の除外項目を持ち込まない。
 */
import type { DiagnosticBuffer } from './diagnostic-buffer';

function sanitizeMessage(value: unknown): string {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }
  if (typeof value === 'string') {
    return value;
  }
  return `non-error value (${typeof value})`;
}

function sanitizeStack(value: unknown): string | undefined {
  return value instanceof Error && typeof value.stack === 'string' ? value.stack : undefined;
}

export function registerGlobalErrorHandler(buffer: DiagnosticBuffer): void {
  window.addEventListener('error', (event: ErrorEvent) => {
    buffer.record('error', sanitizeMessage(event.error ?? event.message), sanitizeStack(event.error));
  });
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    buffer.record('unhandledrejection', sanitizeMessage(event.reason), sanitizeStack(event.reason));
  });
}
