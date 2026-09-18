// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { MockConfluenceApi } from '../../src/shared/api/mock-confluence-api';
import { DiagnosticBuffer } from '../../src/shared/diagnostics/diagnostic-buffer';
import type { AttachmentSummary } from '../../src/shared/types/media';
import { renderProbeUi } from '../../src/gallery/probe-ui';

function makeAttachment(id: string, overrides: Partial<AttachmentSummary> = {}): AttachmentSummary {
  return {
    attachmentId: id,
    pageId: 'page-1',
    title: `file-${id}.png`,
    mediaType: 'image/png',
    kind: 'image',
    version: 1,
    ...overrides,
  };
}

describe('renderProbeUi', () => {
  it('attachmentId/version/mediaTypeの表とprobeボタン3種を表示する', async () => {
    const api = new MockConfluenceApi([
      makeAttachment('a1'),
      makeAttachment('a2', { mediaType: 'video/mp4', kind: 'video', version: 3 }),
    ]);
    const root = document.createElement('div');
    await renderProbeUi(root, { pageId: 'page-1', api, diagnostics: new DiagnosticBuffer() });

    const rows = root.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[1]?.textContent).toContain('a2');
    expect(rows[1]?.textContent).toContain('3');
    expect(rows[1]?.textContent).toContain('video/mp4');
    expect(rows[0]?.querySelectorAll('button')).toHaveLength(3);
  });

  it('ページネーションを辿って全件表示する', async () => {
    const many = Array.from({ length: 120 }, (_, i) => makeAttachment(`a${i}`));
    const api = new MockConfluenceApi(many);
    const root = document.createElement('div');
    await renderProbeUi(root, { pageId: 'page-1', api, diagnostics: new DiagnosticBuffer() });

    expect(root.querySelectorAll('tbody tr')).toHaveLength(120);
    // DEFAULT_LIST_LIMIT=50 → 3回のlist呼び出し
    expect(api.calls.filter((c) => c.startsWith('list:'))).toHaveLength(3);
  });

  it('probe handler未指定のボタン押下は診断バッファへ記録する', async () => {
    const api = new MockConfluenceApi([makeAttachment('a1')]);
    const diagnostics = new DiagnosticBuffer();
    const root = document.createElement('div');
    await renderProbeUi(root, { pageId: 'page-1', api, diagnostics });

    (root.querySelector('button[data-action="thumbnail"]') as HTMLButtonElement).click();
    expect(diagnostics.snapshot().some((e) => e.message.includes('probe未実装'))).toBe(true);
  });

  it('probe handler指定時はhandlerを呼ぶ', async () => {
    const api = new MockConfluenceApi([makeAttachment('a1')]);
    const onProbe = vi.fn();
    const root = document.createElement('div');
    await renderProbeUi(root, {
      pageId: 'page-1',
      api,
      diagnostics: new DiagnosticBuffer(),
      onProbe,
    });

    (root.querySelector('button[data-action="original"]') as HTMLButtonElement).click();
    expect(onProbe).toHaveBeenCalledWith('original', expect.objectContaining({ attachmentId: 'a1' }));
  });

  it('取得失敗時はエラーメッセージを表示し診断へ記録する', async () => {
    const api = new MockConfluenceApi([makeAttachment('a1')]);
    api.setBehavior({ failStatus: 429 });
    const diagnostics = new DiagnosticBuffer();
    const root = document.createElement('div');
    await renderProbeUi(root, { pageId: 'page-1', api, diagnostics });

    expect(root.textContent).toContain('取得できませんでした');
    expect(diagnostics.snapshot().some((e) => e.kind === 'error')).toBe(true);
  });

  it('0件時は空状態を表示する', async () => {
    const api = new MockConfluenceApi([]);
    const root = document.createElement('div');
    await renderProbeUi(root, { pageId: 'page-1', api, diagnostics: new DiagnosticBuffer() });

    expect(root.textContent).toContain('Attachmentはありません');
  });
});
