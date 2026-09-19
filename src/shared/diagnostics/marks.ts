/**
 * 計測基盤: performance.mark / measure のwrapper(Phase0_Spec §5.1)。
 * mark名は `p0.<wu>.<event>`、measure名は `p0.<from>→<to>`。
 */

export function mark(name: string): void {
  performance.mark(name);
}

export function measure(name: string, start: string, end: string): number | undefined {
  try {
    const entry = performance.measure(name, start, end);
    return entry.duration;
  } catch {
    // mark未到達(エラー経路等)は計測なしとして扱う
    return undefined;
  }
}

export interface MarkSnapshot {
  readonly marks: readonly { name: string; startTime: number }[];
  readonly measures: readonly { name: string; startTime: number; duration: number }[];
}

export function snapshotMarks(prefix = 'p0.'): MarkSnapshot {
  return {
    marks: performance
      .getEntriesByType('mark')
      .filter((e) => e.name.startsWith(prefix))
      .map((e) => ({ name: e.name, startTime: e.startTime })),
    measures: performance
      .getEntriesByType('measure')
      .filter((e) => e.name.startsWith(prefix))
      .map((e) => ({ name: e.name, startTime: e.startTime, duration: e.duration })),
  };
}
