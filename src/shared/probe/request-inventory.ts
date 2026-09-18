/**
 * request inventory(Phase0_Spec §5.2)。
 * PerformanceObserver(resource entry)で取得できる範囲を記録する。
 * cross-originで Timing-Allow-Origin がない場合は `partial: true` を付け、
 * DevTools HARを正本とする。queryは除去しhostとpathのみ記録する。
 */

export interface RequestRecord {
  /** hostとpathのみ(query除去) */
  readonly name: string;
  readonly initiatorType: string;
  readonly transferSize: number;
  readonly encodedBodySize: number;
  readonly duration: number;
  readonly partial: boolean;
}

function stripQuery(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return url.split('?')[0] ?? url;
  }
}

export class RequestInventory {
  private readonly records: RequestRecord[] = [];
  private observer: PerformanceObserver | undefined;

  start(): void {
    if (this.observer || typeof PerformanceObserver === 'undefined') return;
    this.observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const resource = entry as PerformanceResourceTiming;
        this.records.push({
          name: stripQuery(resource.name),
          initiatorType: resource.initiatorType,
          transferSize: resource.transferSize,
          encodedBodySize: resource.encodedBodySize,
          duration: resource.duration,
          // Timing-Allow-Originなしのcross-originはサイズ・詳細timingが0になる
          partial: resource.transferSize === 0 && resource.duration >= 0 && resource.responseStart === 0,
        });
      }
    });
    this.observer.observe({ type: 'resource', buffered: true });
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = undefined;
  }

  snapshot(): readonly RequestRecord[] {
    return [...this.records];
  }
}
