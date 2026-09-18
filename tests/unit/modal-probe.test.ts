// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { MockConfluenceApi } from '../../src/shared/api/mock-confluence-api';
import { DiagnosticBuffer } from '../../src/shared/diagnostics/diagnostic-buffer';
import type { AttachmentSummary } from '../../src/shared/types/media';
import { runModalProbe } from '../../src/gallery/probes/modal-probe';

const item: AttachmentSummary = {
  attachmentId: 'a1',
  pageId: 'page-1',
  title: 'photo.png',
  mediaType: 'image/png',
  kind: 'image',
  version: 2,
};

function makeHarness() {
  const api = new MockConfluenceApi([item]);
  const diagnostics = new DiagnosticBuffer();
  const emitted: { name: string; payload: unknown }[] = [];
  const handlers = new Map<string, (payload: unknown) => void>();
  let openedContext: Record<string, unknown> | undefined;
  let onCloseCb: ((payload?: unknown) => void) | undefined;
  const deps = {
    api,
    diagnostics,
    openModal: vi.fn((context: Record<string, unknown>, onClose: (p?: unknown) => void) => {
      openedContext = context;
      onCloseCb = onClose;
      return Promise.resolve();
    }),
    emitEvent: vi.fn((name: string, payload: unknown) => {
      emitted.push({ name, payload });
      return Promise.resolve();
    }),
    onEvent: vi.fn((name: string, handler: (payload: unknown) => void) => {
      handlers.set(name, handler);
      return Promise.resolve(() => undefined);
    }),
  };
  return {
    deps,
    diagnostics,
    emitted,
    handlers,
    getContext: () => openedContext,
    close: (p?: unknown) => onCloseCb?.(p),
  };
}

describe('runModalProbe', () => {
  it('購読→open→snapshot(JSONメタデータ)を渡す', async () => {
    const h = makeHarness();
    const container = document.createElement('div');

    await runModalProbe(container, item, h.deps);

    expect(h.deps.onEvent).toHaveBeenCalledWith('mg-viewer-ready', expect.any(Function));
    expect(h.deps.openModal).toHaveBeenCalledTimes(1);
    const ctx = h.getContext();
    expect(ctx?.['attachmentId']).toBe('a1');
    expect(ctx?.['version']).toBe(2);
    expect(typeof ctx?.['t0']).toBe('number');
    expect(String(ctx?.['mediaUrl'])).toContain('width=640');
    expect(performance.getEntriesByName('p0.modal.open-called').length).toBeGreaterThan(0);
  });

  it('viewer-ready受信でpingを送出し、pongで往復時間を記録する', async () => {
    const h = makeHarness();
    const container = document.createElement('div');
    await runModalProbe(container, item, h.deps);

    h.handlers.get('mg-viewer-ready')?.({ dclDeltaMs: 100, paintDeltaMs: 150, innerWidth: 1920, innerHeight: 1080 });
    const ping = h.emitted.find((e) => e.name === 'mg-probe-ping');
    expect(ping).toBeDefined();

    h.handlers.get('mg-probe-pong')?.(ping?.payload);
    expect(container.textContent).toContain('events往復');
    expect(h.diagnostics.snapshot().some((e) => e.message.includes('events往復'))).toBe(true);
  });

  it('close callbackでpayloadを記録する', async () => {
    const h = makeHarness();
    const container = document.createElement('div');
    await runModalProbe(container, item, h.deps);

    h.close({ reason: 'escape' });

    expect(container.textContent).toContain('modal closed');
    expect(container.textContent).toContain('escape');
  });
});
