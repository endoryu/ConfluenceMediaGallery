// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { MockConfluenceApi } from '../../src/shared/api/mock-confluence-api';
import { DiagnosticBuffer } from '../../src/shared/diagnostics/diagnostic-buffer';
import type { AttachmentSummary } from '../../src/shared/types/media';
import { runMediaProbe } from '../../src/gallery/probes/media-probe';

function makeItem(kind: 'video' | 'audio', mediaType: string): AttachmentSummary {
  return {
    attachmentId: 'm1',
    pageId: 'page-1',
    title: 'media-file',
    mediaType,
    kind,
    version: 1,
  };
}

describe('runMediaProbe', () => {
  it('videoはpreload=metadata・controls付きのvideo要素を生成する', () => {
    const api = new MockConfluenceApi([]);
    const container = document.createElement('div');

    runMediaProbe(container, makeItem('video', 'video/mp4'), {
      api,
      diagnostics: new DiagnosticBuffer(),
    });

    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(video?.getAttribute('preload')).toBe('metadata');
    expect(video?.controls).toBe(true);
    expect(video?.src).toContain('mock://original/page-1/m1');
  });

  it('audioはaudio要素を生成する', () => {
    const api = new MockConfluenceApi([]);
    const container = document.createElement('div');

    runMediaProbe(container, makeItem('audio', 'audio/mpeg'), {
      api,
      diagnostics: new DiagnosticBuffer(),
    });

    expect(container.querySelector('audio')).not.toBeNull();
    expect(container.querySelector('video')).toBeNull();
  });

  it('close相当ボタンでsrcが解除される', () => {
    const api = new MockConfluenceApi([]);
    const diagnostics = new DiagnosticBuffer();
    const container = document.createElement('div');
    runMediaProbe(container, makeItem('video', 'video/mp4'), { api, diagnostics });

    (container.querySelector('button[data-action="media-release"]') as HTMLButtonElement).click();

    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video.getAttribute('src')).toBeNull();
    expect(diagnostics.snapshot().some((e) => e.message.includes('close相当'))).toBe(true);
  });

  it('duration未確定時の連続seekはエラーとして記録する', () => {
    const api = new MockConfluenceApi([]);
    const diagnostics = new DiagnosticBuffer();
    const container = document.createElement('div');
    runMediaProbe(container, makeItem('video', 'video/mp4'), { api, diagnostics });

    (container.querySelector('button[data-action="media-seek"]') as HTMLButtonElement).click();

    expect(diagnostics.snapshot().some((e) => e.kind === 'error' && e.message.includes('連続seek不可'))).toBe(
      true,
    );
  });

  it('診断記録にqueryを含めない', () => {
    const api = new MockConfluenceApi([]);
    const diagnostics = new DiagnosticBuffer();
    const container = document.createElement('div');
    runMediaProbe(container, makeItem('video', 'video/mp4'), { api, diagnostics });

    for (const entry of diagnostics.snapshot()) {
      expect(entry.message).not.toContain('?');
    }
  });
});
