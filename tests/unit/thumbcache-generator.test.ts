// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { AttachmentWriterApi, BinaryFetchResult } from '../../src/shared/api/confluence-api';
import type { AttachmentSummary } from '../../src/shared/types/media';
import { buildMediaModel } from '../../src/gallery/media-items';
import type { BinaryFetcher } from '../../src/gallery/thumbcache/chunked-fetch';
import { parseThumbcacheConfig } from '../../src/gallery/thumbcache/config';
import type { DownscaleResult } from '../../src/gallery/thumbcache/downscale';
import {
  ThumbcacheGenerator,
  planThumbWork,
} from '../../src/gallery/thumbcache/generator';

function makeItem(id: string, overrides: Partial<AttachmentSummary> = {}): AttachmentSummary {
  return {
    attachmentId: id,
    pageId: 'page-1',
    title: `photo-${id}.png`,
    mediaType: 'image/jpeg',
    kind: 'image',
    version: 1,
    ...overrides,
  };
}

function thumbOf(cacheId: string, targetId: string, v: number, w: number): AttachmentSummary {
  return makeItem(cacheId, { title: `mg_thumbcache_${targetId}_v${v}_w${w}` });
}

class StubWriter implements AttachmentWriterApi {
  uploads: { name: string; type: string; size: number }[] = [];
  deletes: string[] = [];
  writable = true;
  uploadStatus = 200;
  configTexts: string[] = [];

  canUpdateAttachment(): Promise<boolean> {
    return Promise.resolve(this.writable);
  }
  async uploadAttachment(
    _pageId: string,
    fileName: string,
    blob: Blob,
  ): Promise<{ status: number; attachmentId?: string }> {
    this.uploads.push({ name: fileName, type: blob.type, size: blob.size });
    if (fileName === 'mg_thumbcache_config') this.configTexts.push(await blob.text());
    return { status: this.uploadStatus };
  }
  updateAttachmentData(): Promise<{ status: number }> {
    return Promise.resolve({ status: 200 });
  }
  deleteAttachment(attachmentId: string): Promise<{ status: number }> {
    this.deletes.push(attachmentId);
    return Promise.resolve({ status: 204 });
  }
}

const okFetcher: BinaryFetcher = {
  fetchBinary: (): Promise<BinaryFetchResult> =>
    Promise.resolve({ ok: true, status: 200, blob: new Blob(['src'], { type: 'image/jpeg' }) }),
};

function stubDownscale(sourceWidth: number) {
  return (
    _doc: Document,
    _source: Blob,
    maxWidth: number,
    outputType: 'image/png' | 'image/jpeg',
  ): Promise<DownscaleResult> =>
    Promise.resolve({
      blob: new Blob([`w${maxWidth}`], { type: outputType }),
      sourceWidth,
    });
}

function makeGenerator(
  writer: StubWriter,
  opts: {
    fetcher?: BinaryFetcher;
    sourceWidth?: number;
    claim?: { acquire(): Promise<boolean>; release(): void };
  } = {},
) {
  return new ThumbcacheGenerator({
    pageId: 'page-1',
    document,
    fetcher: opts.fetcher ?? okFetcher,
    writer,
    buildSourcePath: (item) => `/download/${item.attachmentId}`,
    idle: () => Promise.resolve(),
    downscale: stubDownscale(opts.sourceWidth ?? 4000),
    ...(opts.claim ? { claim: opts.claim } : {}),
  });
}

describe('planThumbWork', () => {
  it('欠落widthのみ列挙し、非imageは除外する', () => {
    const model = buildMediaModel([
      makeItem('1'), // 全欠落
      makeItem('2'),
      thumbOf('90', '2', 1, 320), // 2は640のみ欠落
      makeItem('3', { kind: 'video', mediaType: 'video/mp4' }),
    ]);
    const tasks = planThumbWork(model);
    expect(tasks.map((t) => [t.item.attachmentId, [...t.widths]])).toEqual([
      ['1', [320, 640]],
      ['2', [640]],
    ]);
  });
});

describe('ThumbcacheGenerator.run', () => {
  it('欠落thumbを生成しconfig台帳を書く', async () => {
    const writer = new StubWriter();
    const model = buildMediaModel([makeItem('1'), makeItem('2', { mediaType: 'image/png' })]);
    const summary = await makeGenerator(writer).run(model, null);

    expect(summary.outcome).toBe('generated');
    expect(summary.generated).toBe(4);
    const names = writer.uploads.map((u) => u.name);
    expect(names).toContain('mg_thumbcache_1_v1_w320');
    expect(names).toContain('mg_thumbcache_1_v1_w640');
    expect(names).toContain('mg_thumbcache_2_v1_w320');
    // 透過系(png)はPNG出力、それ以外はJPEG(§5.2/WU-5作業4)
    expect(writer.uploads.find((u) => u.name === 'mg_thumbcache_2_v1_w320')?.type).toBe('image/png');
    expect(writer.uploads.find((u) => u.name === 'mg_thumbcache_1_v1_w320')?.type).toBe('image/jpeg');
    // config台帳
    const config = parseThumbcacheConfig(writer.configTexts.at(-1) ?? '');
    expect(config?.ledger['1']?.widths).toEqual([320, 640]);
    expect(config?.disabled).toBe(false);
  });

  it('元画像が320以下なら640は生成しない', async () => {
    const writer = new StubWriter();
    const model = buildMediaModel([makeItem('1')]);
    const summary = await makeGenerator(writer, { sourceWidth: 300 }).run(model, null);
    expect(summary.generated).toBe(1);
    expect(writer.uploads.map((u) => u.name)).toEqual([
      'mg_thumbcache_1_v1_w320',
      'mg_thumbcache_config',
    ]);
  });

  it('disabled configでは何も書かない', async () => {
    const writer = new StubWriter();
    const model = buildMediaModel([makeItem('1')]);
    const summary = await makeGenerator(writer).run(model, {
      schemaVersion: 1,
      disabled: true,
      ledger: {},
    });
    expect(summary.outcome).toBe('disabled');
    expect(writer.uploads).toEqual([]);
  });

  it('非writerは書込みゼロで静かに終わる', async () => {
    const writer = new StubWriter();
    writer.writable = false;
    const model = buildMediaModel([makeItem('1')]);
    const summary = await makeGenerator(writer).run(model, null);
    expect(summary.outcome).toBe('not-writer');
    expect(writer.uploads).toEqual([]);
  });

  it('claim敗退時は書込みしない', async () => {
    const writer = new StubWriter();
    const model = buildMediaModel([makeItem('1')]);
    const claim = { acquire: () => Promise.resolve(false), release: () => undefined };
    const summary = await makeGenerator(writer, { claim }).run(model, null);
    expect(summary.outcome).toBe('claimed-elsewhere');
    expect(writer.uploads).toEqual([]);
  });

  it('upload 403で生成を停止する(権限喪失)', async () => {
    const writer = new StubWriter();
    writer.uploadStatus = 403;
    const model = buildMediaModel([makeItem('1'), makeItem('2')]);
    const summary = await makeGenerator(writer).run(model, null);
    expect(summary.outcome).toBe('not-writer');
    expect(writer.uploads.length).toBe(1); // 最初の1回で停止
  });

  it('staleのGCは命名parse済みrefのみ削除する', async () => {
    const writer = new StubWriter();
    const model = buildMediaModel([
      makeItem('1', { version: 2 }),
      thumbOf('90', '1', 2, 320), // 有効
      thumbOf('91', '1', 2, 640), // 有効
      thumbOf('92', '1', 1, 320), // stale(旧版)
      thumbOf('93', '5', 1, 320), // stale(対象喪失)
    ]);
    const summary = await makeGenerator(writer).run(model, null);
    expect(summary.deleted).toBe(2);
    expect(writer.deletes.sort()).toEqual(['92', '93']);
  });

  it('一括取得失敗はRange分割へfallbackする', async () => {
    const writer = new StubWriter();
    const total = 5000;
    const fetcher: BinaryFetcher = {
      fetchBinary: (_path, opts): Promise<BinaryFetchResult> => {
        if (!opts?.range) return Promise.resolve({ ok: false, status: 500 });
        const m = /bytes=(\d+)-(\d+)/.exec(opts.range);
        const start = Number(m?.[1] ?? 0);
        const end = Math.min(Number(m?.[2] ?? 0), total - 1);
        return Promise.resolve({
          ok: true,
          status: 206,
          blob: new Blob([new Uint8Array(end - start + 1)], { type: 'image/jpeg' }),
          contentRange: `bytes ${start}-${end}/${total}`,
        });
      },
    };
    const model = buildMediaModel([makeItem('1')]);
    const summary = await makeGenerator(writer, { fetcher }).run(model, null);
    expect(summary.outcome).toBe('generated');
    expect(summary.generated).toBe(2);
  });

  it('素材取得が全滅したitemはスキップして続行する', async () => {
    const writer = new StubWriter();
    const fetcher: BinaryFetcher = {
      fetchBinary: (path): Promise<BinaryFetchResult> =>
        path.includes('/1')
          ? Promise.resolve({ ok: false, status: 404 })
          : Promise.resolve({ ok: true, status: 200, blob: new Blob(['x'], { type: 'image/jpeg' }) }),
    };
    const model = buildMediaModel([makeItem('1'), makeItem('2')]);
    const summary = await makeGenerator(writer, { fetcher }).run(model, null);
    expect(summary.skipped).toBe(1);
    expect(writer.uploads.some((u) => u.name.startsWith('mg_thumbcache_2_'))).toBe(true);
    expect(writer.uploads.some((u) => u.name.startsWith('mg_thumbcache_1_'))).toBe(false);
  });
});

describe('手動操作(WU-5作業8)', () => {
  it('clearAllは有効・stale全thumbを削除し台帳を空にする', async () => {
    const writer = new StubWriter();
    const model = buildMediaModel([
      makeItem('1'),
      thumbOf('90', '1', 1, 320),
      thumbOf('91', '2', 1, 320), // stale
    ]);
    const generator = makeGenerator(writer);
    const deleted = await generator.clearAll(model, null);
    expect(deleted).toBe(2);
    expect(writer.deletes.sort()).toEqual(['90', '91']);
    const config = parseThumbcacheConfig(writer.configTexts.at(-1) ?? '');
    expect(config?.ledger).toEqual({});
  });

  it('setDisabledはフラグのみ変更、書込み拒否(403)はfalse', async () => {
    const writer = new StubWriter();
    const generator = makeGenerator(writer);
    expect(await generator.setDisabled(null, true)).toBe(true);
    const config = parseThumbcacheConfig(writer.configTexts.at(-1) ?? '');
    expect(config?.disabled).toBe(true);

    writer.uploadStatus = 403;
    expect(await generator.setDisabled(null, false)).toBe(false);
  });
});
