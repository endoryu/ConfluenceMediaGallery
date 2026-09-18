// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { DiagnosticBuffer } from '../../src/shared/diagnostics/diagnostic-buffer';
import type { ViewerProbeDeps } from '../../src/viewer/viewer-probe';
import { renderViewerProbe } from '../../src/viewer/viewer-probe';

function makeDeps(overrides: Partial<ViewerProbeDeps> = {}): {
  deps: ViewerProbeDeps;
  close: ReturnType<typeof vi.fn>;
  emitted: { name: string; payload: unknown }[];
  handlers: Map<string, (payload: unknown) => void>;
} {
  const close = vi.fn();
  const emitted: { name: string; payload: unknown }[] = [];
  const handlers = new Map<string, (payload: unknown) => void>();
  const deps: ViewerProbeDeps = {
    context: { t0: 1000, mediaUrl: 'mock://thumbnail/a1?version=1&width=640' },
    diagnostics: new DiagnosticBuffer(),
    close,
    emitEvent: (name, payload) => {
      emitted.push({ name, payload });
    },
    onEvent: (name, handler) => {
      handlers.set(name, handler);
      return () => undefined;
    },
    metrics: { dclDeltaMs: 120, paintDeltaMs: 180 },
    ...overrides,
  };
  return { deps, close, emitted, handlers };
}

describe('renderViewerProbe', () => {
  it('表示領域・計測値を表示し、readyを送出する', async () => {
    const { deps, emitted } = makeDeps();
    const root = document.createElement('div');
    document.body.append(root);

    await renderViewerProbe(root, deps);

    expect(root.textContent).toContain('innerWidth');
    expect(root.textContent).toContain('120ms');
    expect(root.textContent).toContain('180ms');
    const ready = emitted.find((e) => e.name === 'mg-viewer-ready');
    expect(ready).toBeDefined();
    expect((ready?.payload as Record<string, unknown>)['dclDeltaMs']).toBe(120);
  });

  it('Escで自前handlerがcloseを呼ぶ', async () => {
    const { deps, close } = makeDeps();
    const root = document.createElement('div');
    document.body.append(root);
    await renderViewerProbe(root, deps);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(close).toHaveBeenCalledWith({ reason: 'escape' });
  });

  it('閉じるボタンがcloseを呼ぶ', async () => {
    const { deps, close } = makeDeps();
    const root = document.createElement('div');
    document.body.append(root);
    await renderViewerProbe(root, deps);

    (root.querySelector('button[data-action="viewer-close"]') as HTMLButtonElement).click();

    expect(close).toHaveBeenCalledWith({ reason: 'close-button' });
  });

  it('ping受信でpongへ同一payloadをechoする', async () => {
    const { deps, emitted, handlers } = makeDeps();
    const root = document.createElement('div');
    document.body.append(root);
    await renderViewerProbe(root, deps);

    const payload = { sentAt: 12345 };
    handlers.get('mg-probe-ping')?.(payload);

    const pong = emitted.find((e) => e.name === 'mg-probe-pong');
    expect(pong?.payload).toBe(payload);
  });

  it('video controls要素(Esc focus確認用)を含む', async () => {
    const { deps } = makeDeps();
    const root = document.createElement('div');
    document.body.append(root);
    await renderViewerProbe(root, deps);

    const video = root.querySelector('video');
    expect(video).not.toBeNull();
    expect((video as HTMLVideoElement).controls).toBe(true);
  });
});
