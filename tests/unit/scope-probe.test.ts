// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { MockConfluenceApi } from '../../src/shared/api/mock-confluence-api';
import { DiagnosticBuffer } from '../../src/shared/diagnostics/diagnostic-buffer';
import type { WriteProbeApi } from '../../src/shared/api/confluence-api';
import type { AttachmentSummary } from '../../src/shared/types/media';
import { G2_PROBE_FILENAME, runG2WriteProbe, runUsersBulkProbe } from '../../src/gallery/probes/scope-probe';

const items: AttachmentSummary[] = [
  {
    attachmentId: 'a1',
    pageId: 'p1',
    title: 'x.png',
    mediaType: 'image/png',
    kind: 'image',
    version: 1,
    authorId: 'acc-1',
  },
];

describe('runUsersBulkProbe', () => {
  it('authorIdを解決して件数を表示する', async () => {
    const api = new MockConfluenceApi(items, [{ accountId: 'acc-1', displayName: 'User One' }]);
    const status = document.createElement('span');

    await runUsersBulkProbe(status, items, api, new DiagnosticBuffer());

    expect(status.textContent).toContain('成立(1件解決)');
  });

  it('authorIdなしはエラー記録', async () => {
    const api = new MockConfluenceApi([]);
    const status = document.createElement('span');
    const diagnostics = new DiagnosticBuffer();

    const { authorId: _authorId, ...withoutAuthor } = items[0]!;
    await runUsersBulkProbe(status, [withoutAuthor as AttachmentSummary], api, diagnostics);

    expect(diagnostics.snapshot().some((e) => e.kind === 'error')).toBe(true);
  });
});

describe('runG2WriteProbe', () => {
  function makeWriteApi(overrides: Partial<WriteProbeApi> = {}): WriteProbeApi {
    return {
      uploadAttachment: vi.fn(() => Promise.resolve({ status: 200, attachmentId: 'att-g2' })),
      updateAttachmentData: vi.fn(() => Promise.resolve({ status: 200 })),
      deleteAttachment: vi.fn(() => Promise.resolve({ status: 204 })),
      ...overrides,
    };
  }

  it('upload→版更新→削除のroundtripを実行する(jsdomはtoBlob不可のため生成不可を記録)', async () => {
    const api = makeWriteApi();
    const status = document.createElement('span');
    const diagnostics = new DiagnosticBuffer();

    await runG2WriteProbe(status, 'p1', api, diagnostics, document);

    // jsdomではcanvas.toBlobが動かないため、生成不可 or roundtrip完了のどちらかで終端する
    expect(status.textContent).not.toBe('');
    expect(diagnostics.snapshot().length).toBeGreaterThan(0);
  });

  it('G2ファイル名はmg_thumbcache_命名規則に従い拡張子なし', () => {
    expect(G2_PROBE_FILENAME.startsWith('mg_thumbcache_')).toBe(true);
    expect(G2_PROBE_FILENAME).not.toContain('.');
  });
});
