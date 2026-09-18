// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { MockConfluenceApi } from '../../src/shared/api/mock-confluence-api';
import { DiagnosticBuffer } from '../../src/shared/diagnostics/diagnostic-buffer';
import type { AttachmentSummary } from '../../src/shared/types/media';
import type { ImageLoader } from '../../src/gallery/probes/probe-dom';
import type { CorsProbe } from '../../src/gallery/probes/original-probe';
import { runOriginalProbe } from '../../src/gallery/probes/original-probe';

function makeItem(version: number, overrides: Partial<AttachmentSummary> = {}): AttachmentSummary {
  return {
    attachmentId: 'a1',
    pageId: 'page-1',
    title: 'photo.png',
    mediaType: 'image/png',
    kind: 'image',
    version,
    ...overrides,
  };
}

function stubLoader(): { loader: ImageLoader; urls: string[] } {
  const urls: string[] = [];
  const loader: ImageLoader = (_doc, url) => {
    urls.push(url);
    return Promise.resolve({ ok: true, naturalWidth: 4000, naturalHeight: 3000, loadMs: 10 });
  };
  return { loader, urls };
}

const okCorsProbe: CorsProbe = () =>
  Promise.resolve({
    crossoriginLoaded: true,
    blobObtained: true,
    blobSize: 12345,
    blobType: 'image/jpeg',
  });

describe('runOriginalProbe', () => {
  it('redirect probeとv1/downloadLink比較を表示する', async () => {
    const api = new MockConfluenceApi([makeItem(1)]);
    const probeSpy = vi.spyOn(api, 'redirectProbe');
    const { loader, urls } = stubLoader();
    const container = document.createElement('div');

    await runOriginalProbe(container, makeItem(1, { downloadLink: '/download/attachments/1/photo.png' }), {
      api,
      diagnostics: new DiagnosticBuffer(),
      loadImage: loader,
      corsProbe: okCorsProbe,
    });

    expect(probeSpy).toHaveBeenCalledWith(
      '/wiki/rest/api/content/page-1/child/attachment/a1/download?version=1',
    );
    expect(container.textContent).toContain('manual-302');
    expect(urls.some((u) => u.startsWith('mock://original/page-1/a1'))).toBe(true);
    // downloadLinkは/wikiベース相対として解決される
    expect(urls.some((u) => u.includes('/wiki/download/attachments/1/photo.png'))).toBe(true);
  });

  it('G1b(bridge経由blob→縮小)の結果を表示する', async () => {
    const api = new MockConfluenceApi([makeItem(1)]);
    const { loader } = stubLoader();
    const container = document.createElement('div');

    await runOriginalProbe(container, makeItem(1), {
      api,
      diagnostics: new DiagnosticBuffer(),
      loadImage: loader,
      corsProbe: okCorsProbe,
      bridgeBlobProbe: () =>
        Promise.resolve({
          bytesFetched: true,
          sourceSize: 999,
          sourceType: 'image/png',
          blobObtained: true,
          blobSize: 111,
          blobType: 'image/jpeg',
        }),
    });

    expect(container.textContent).toContain('G1b');
    expect(container.textContent).toContain('999 bytes');
    expect(container.textContent).toContain('111 bytes');
  });

  it('downloadLink不在は明示表示する', async () => {
    const api = new MockConfluenceApi([makeItem(1)]);
    const { loader } = stubLoader();
    const container = document.createElement('div');

    await runOriginalProbe(container, makeItem(1), {
      api,
      diagnostics: new DiagnosticBuffer(),
      loadImage: loader,
      corsProbe: okCorsProbe,
    });

    expect(container.textContent).toContain('一覧レスポンスに存在しない');
  });

  it('version>=2で旧版とversionなしをロードする', async () => {
    const api = new MockConfluenceApi([makeItem(3)]);
    const { loader, urls } = stubLoader();
    const container = document.createElement('div');

    await runOriginalProbe(container, makeItem(3), {
      api,
      diagnostics: new DiagnosticBuffer(),
      loadImage: loader,
      corsProbe: okCorsProbe,
    });

    expect(container.textContent).toContain('version検証');
    expect(urls.some((u) => u.includes('version=2'))).toBe(true);
    expect(urls.some((u) => !u.includes('version='))).toBe(true);
  });

  it('G1結果を表示し、Blob不成立はerrorとして診断へ記録する', async () => {
    const api = new MockConfluenceApi([makeItem(1)]);
    const diagnostics = new DiagnosticBuffer();
    const { loader } = stubLoader();
    const failCors: CorsProbe = () =>
      Promise.resolve({
        crossoriginLoaded: false,
        blobObtained: false,
        taintedError: 'SecurityError: tainted canvas',
      });
    const container = document.createElement('div');

    await runOriginalProbe(container, makeItem(1), {
      api,
      diagnostics,
      loadImage: loader,
      corsProbe: failCors,
    });

    expect(container.textContent).toContain('G1: CORS読み出し');
    expect(container.textContent).toContain('SecurityError');
    expect(
      diagnostics.snapshot().some((e) => e.kind === 'error' && e.message.includes('G1')),
    ).toBe(true);
  });

  it('診断記録にqueryを含めない', async () => {
    const api = new MockConfluenceApi([makeItem(2)]);
    const diagnostics = new DiagnosticBuffer();
    const { loader } = stubLoader();
    const container = document.createElement('div');

    await runOriginalProbe(container, makeItem(2), {
      api,
      diagnostics,
      loadImage: loader,
      corsProbe: okCorsProbe,
    });

    for (const entry of diagnostics.snapshot()) {
      expect(entry.message).not.toContain('?');
    }
  });
});
