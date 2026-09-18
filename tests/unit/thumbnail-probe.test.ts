// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { MockConfluenceApi } from '../../src/shared/api/mock-confluence-api';
import { DiagnosticBuffer } from '../../src/shared/diagnostics/diagnostic-buffer';
import type { AttachmentSummary } from '../../src/shared/types/media';
import type { ImageLoader } from '../../src/gallery/probes/thumbnail-probe';
import { runThumbnailProbe } from '../../src/gallery/probes/thumbnail-probe';

function makeItem(version: number): AttachmentSummary {
  return {
    attachmentId: 'a1',
    pageId: 'page-1',
    title: 'photo.png',
    mediaType: 'image/png',
    kind: 'image',
    version,
  };
}

function stubLoader(): { loader: ImageLoader; urls: string[] } {
  const urls: string[] = [];
  const loader: ImageLoader = (_doc, url) => {
    urls.push(url);
    return Promise.resolve({ ok: true, naturalWidth: 320, naturalHeight: 240, loadMs: 5 });
  };
  return { loader, urls };
}

describe('runThumbnailProbe', () => {
  it('redirect probe結果を表示し、width 320/640でロードする', async () => {
    const api = new MockConfluenceApi([makeItem(1)]);
    const probeSpy = vi.spyOn(api, 'thumbnailRedirectProbe');
    const { loader, urls } = stubLoader();
    const container = document.createElement('div');

    await runThumbnailProbe(container, makeItem(1), {
      api,
      diagnostics: new DiagnosticBuffer(),
      loadImage: loader,
    });

    expect(probeSpy).toHaveBeenCalledWith('a1', 1, 320);
    expect(container.textContent).toContain('manual-302');
    expect(container.textContent).toContain('media.mock.test/file/thumb');
    expect(urls.some((u) => u.includes('width=320'))).toBe(true);
    expect(urls.some((u) => u.includes('width=640'))).toBe(true);
    // version 1 のときは version検証セクションなし
    expect(container.textContent).not.toContain('version検証');
  });

  it('version>=2でversionあり/旧版/なしの3通りをロードする', async () => {
    const api = new MockConfluenceApi([makeItem(3)]);
    const { loader, urls } = stubLoader();
    const container = document.createElement('div');

    await runThumbnailProbe(container, makeItem(3), {
      api,
      diagnostics: new DiagnosticBuffer(),
      loadImage: loader,
    });

    expect(container.textContent).toContain('version検証');
    const versionUrls = urls.filter((u) => u.includes('width=320'));
    expect(versionUrls.some((u) => u.includes('version=3'))).toBe(true);
    expect(versionUrls.some((u) => u.includes('version=2'))).toBe(true);
    expect(versionUrls.some((u) => !u.includes('version='))).toBe(true);
  });

  it('再読込ボタンで同一URLを再ロードする', async () => {
    const api = new MockConfluenceApi([makeItem(1)]);
    const { loader, urls } = stubLoader();
    const container = document.createElement('div');
    await runThumbnailProbe(container, makeItem(1), {
      api,
      diagnostics: new DiagnosticBuffer(),
      loadImage: loader,
    });
    const before = urls.length;

    (container.querySelector('button[data-action="thumbnail-reload"]') as HTMLButtonElement).click();
    await Promise.resolve();

    expect(urls.length).toBe(before + 1);
    expect(urls[urls.length - 1]).toBe(urls[0]);
  });

  it('ロード失敗はerrorとして診断へ記録する', async () => {
    const api = new MockConfluenceApi([makeItem(1)]);
    const diagnostics = new DiagnosticBuffer();
    const failLoader: ImageLoader = () =>
      Promise.resolve({ ok: false, naturalWidth: 0, naturalHeight: 0, loadMs: 3 });
    const container = document.createElement('div');

    await runThumbnailProbe(container, makeItem(1), {
      api,
      diagnostics,
      loadImage: failLoader,
    });

    expect(diagnostics.snapshot().some((e) => e.kind === 'error')).toBe(true);
    expect(container.textContent).toContain('error(表示不可)');
  });

  it('診断記録にsigned URL queryを含めない', async () => {
    const api = new MockConfluenceApi([makeItem(1)]);
    const diagnostics = new DiagnosticBuffer();
    const { loader } = stubLoader();
    const container = document.createElement('div');

    await runThumbnailProbe(container, makeItem(1), {
      api,
      diagnostics,
      loadImage: loader,
    });

    // URLはhost+pathへstripされ、query('?'以降)は診断へ持ち込まれない
    for (const entry of diagnostics.snapshot()) {
      expect(entry.message).not.toContain('?');
    }
  });
});
