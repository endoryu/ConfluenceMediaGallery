import { describe, expect, it } from 'vitest';
import { DIAGNOSTIC_BUFFER_LIMIT } from '../../src/shared/constants';
import { DiagnosticBuffer } from '../../src/shared/diagnostics/diagnostic-buffer';

describe('DiagnosticBuffer', () => {
  it('記録した順に保持する', () => {
    const buffer = new DiagnosticBuffer();
    buffer.record('info', 'first');
    buffer.record('error', 'second', 'stack');
    expect(buffer.size).toBe(2);
    expect(buffer.snapshot()[0]?.message).toBe('first');
    expect(buffer.snapshot()[1]).toMatchObject({ kind: 'error', message: 'second', stack: 'stack' });
  });

  it(`上限${DIAGNOSTIC_BUFFER_LIMIT}件で古い順に破棄する(V1仕様書 §8.4)`, () => {
    const buffer = new DiagnosticBuffer();
    for (let i = 0; i < DIAGNOSTIC_BUFFER_LIMIT + 10; i += 1) {
      buffer.record('info', `entry-${i}`);
    }
    expect(buffer.size).toBe(DIAGNOSTIC_BUFFER_LIMIT);
    expect(buffer.snapshot()[0]?.message).toBe('entry-10');
  });

  it('snapshotはコピーを返す', () => {
    const buffer = new DiagnosticBuffer();
    buffer.record('info', 'only');
    const snap = buffer.snapshot();
    buffer.record('info', 'more');
    expect(snap).toHaveLength(1);
  });
});
