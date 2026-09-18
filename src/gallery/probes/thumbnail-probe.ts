/**
 * WU-2 Thumbnail直接表示probe(P0-1、Phase0_Spec §WU-2)。
 * 1. requestConfluence redirect:manual の可否と302ヘッダー記録
 * 2. native <img src> ロード、naturalWidth/Height、decode()時間
 * 3. 同一URL再読込(cache状態の正本はDevTools)
 * 4. width 320/640 の実寸比較(+width単独、legacy経路)
 * 5. version指定あり/なし/旧版の表示比較(MG-08-Versioning)
 * 出力は画面内とdiagnostics(host+pathのみ。signed URLを持ち込まない)。
 */
import type { ConfluenceApi, ThumbnailProbeApi } from '../../shared/api/confluence-api';
import type { DiagnosticBuffer } from '../../shared/diagnostics/diagnostic-buffer';
import type { AttachmentSummary } from '../../shared/types/media';
import { THUMBNAIL_WIDTH_CANDIDATES } from '../../shared/constants';
import type { ImageLoadResult, ImageLoader } from './probe-dom';
import { appendKeyValues, loadInto, nativeImageLoader, withoutParam } from './probe-dom';

export type { ImageLoadResult, ImageLoader } from './probe-dom';
export { nativeImageLoader } from './probe-dom';

export interface ThumbnailProbeOptions {
  readonly api: ConfluenceApi & ThumbnailProbeApi;
  readonly diagnostics: DiagnosticBuffer;
  readonly loadImage?: ImageLoader;
}

export async function runThumbnailProbe(
  container: HTMLElement,
  item: AttachmentSummary,
  options: ThumbnailProbeOptions,
): Promise<void> {
  const doc = container.ownerDocument;
  const loader = options.loadImage ?? nativeImageLoader;
  const { api, diagnostics } = options;

  const section = doc.createElement('section');
  const heading = doc.createElement('h3');
  heading.textContent = `Thumbnail probe: ${item.attachmentId} v${item.version}`;
  section.append(heading);
  container.append(section);

  // 1. redirect: manual の可否と302ヘッダー(先に確認する — Phase0_Spec WU-2作業1)
  const redirect = await api.thumbnailRedirectProbe(item.attachmentId, item.version, 320);
  appendKeyValues(doc, section, [
    ['redirect probe mode', redirect.mode],
    ['status', String(redirect.status)],
    ['Location(host+path)', redirect.locationHostPath ?? '-'],
    ['Cache-Control', redirect.cacheControl ?? '-'],
    ['Expires', redirect.expires ?? '-'],
    ['ETag', redirect.etag ?? '-'],
    ['note', redirect.note ?? '-'],
  ]);
  diagnostics.record(
    'info',
    `thumbnail redirect probe: mode=${redirect.mode} status=${redirect.status} location=${redirect.locationHostPath ?? '-'} cache-control=${redirect.cacheControl ?? '-'} etag=${redirect.etag ?? '-'} note=${redirect.note ?? '-'}`,
  );

  // 2/4. native <img> 表示と width 320/640 の実寸
  const sizeArea = doc.createElement('div');
  section.append(sizeArea);
  const sizeResults: ImageLoadResult[] = [];
  for (const width of THUMBNAIL_WIDTH_CANDIDATES) {
    const url = api.thumbnailUrl(item.attachmentId, item.version, width);
    sizeResults.push(
      await loadInto(doc, sizeArea, `width=${width}`, url, loader, diagnostics, 'thumbnail'),
    );
  }
  // widthのみ(heightなし)の変則も記録し、パラメータ反映の切り分けに使う
  const widthOnlyUrl = withoutParam(
    api.thumbnailUrl(item.attachmentId, item.version, THUMBNAIL_WIDTH_CANDIDATES[0]),
    'height',
  );
  await loadInto(
    doc,
    sizeArea,
    `width=320のみ(heightなし)`,
    widthOnlyUrl,
    loader,
    diagnostics,
    'thumbnail',
  );
  const [r320, r640] = sizeResults;
  if (
    r320 &&
    r640 &&
    r320.ok &&
    r640.ok &&
    r320.naturalWidth === r640.naturalWidth &&
    r320.naturalWidth > THUMBNAIL_WIDTH_CANDIDATES[1]
  ) {
    diagnostics.record(
      'info',
      `width/height未反映の疑い: 320/640要求に対しnaturalが同一(${r320.naturalWidth}x${r320.naturalHeight})。302 Locationのquery(DevTools)で切り分ける`,
    );
  }

  // 3. 同一URL再読込(HTTP cache確認。Size列の正本はDevTools)
  const reloadButton = doc.createElement('button');
  reloadButton.type = 'button';
  reloadButton.dataset['action'] = 'thumbnail-reload';
  reloadButton.textContent = '同一URL再読込(cache確認)';
  const reloadArea = doc.createElement('div');
  reloadButton.addEventListener('click', () => {
    const url = api.thumbnailUrl(item.attachmentId, item.version, THUMBNAIL_WIDTH_CANDIDATES[0]);
    void loadInto(doc, reloadArea, '再読込', url, loader, diagnostics, 'thumbnail');
  });
  section.append(reloadButton, reloadArea);

  // 4.5 参考: legacy thumbnail経路(/wiki/download/thumbnails/)。
  // v2 endpointのredirect先が/binary(原寸配信)のため、代替経路の挙動を記録する
  try {
    const origin = new URL(api.thumbnailUrl(item.attachmentId, item.version, 320)).origin;
    if (origin !== 'null') {
      const legacyHeading = doc.createElement('h4');
      legacyHeading.textContent = 'legacy thumbnail経路(参考)';
      const legacyArea = doc.createElement('div');
      section.append(legacyHeading, legacyArea);
      const legacyBase = `${origin}/wiki/download/thumbnails/${encodeURIComponent(item.pageId)}/${encodeURIComponent(item.title)}`;
      await loadInto(doc, legacyArea, 'legacy(素)', legacyBase, loader, diagnostics, 'thumbnail');
      await loadInto(
        doc,
        legacyArea,
        'legacy?width=320',
        `${legacyBase}?width=320`,
        loader,
        diagnostics,
        'thumbnail',
      );
      await loadInto(
        doc,
        legacyArea,
        'legacy?width=640',
        `${legacyBase}?width=640`,
        loader,
        diagnostics,
        'thumbnail',
      );
      if (item.version >= 2) {
        await loadInto(
          doc,
          legacyArea,
          `legacy?version=${item.version - 1}(旧版)`,
          `${legacyBase}?version=${item.version - 1}`,
          loader,
          diagnostics,
          'thumbnail',
        );
      }
    }
  } catch {
    // origin解決不能(mock等)は参考probeを省略
  }

  // 5. version検証(旧版が存在する場合のみ)
  if (item.version >= 2) {
    const versionHeading = doc.createElement('h4');
    versionHeading.textContent = 'version検証(MG-08-Versioning)';
    const versionArea = doc.createElement('div');
    section.append(versionHeading, versionArea);
    const currentUrl = api.thumbnailUrl(
      item.attachmentId,
      item.version,
      THUMBNAIL_WIDTH_CANDIDATES[0],
    );
    await loadInto(
      doc,
      versionArea,
      `version=${item.version}(最新)`,
      currentUrl,
      loader,
      diagnostics,
      'thumbnail',
    );
    await loadInto(
      doc,
      versionArea,
      `version=${item.version - 1}(旧版)`,
      api.thumbnailUrl(item.attachmentId, item.version - 1, THUMBNAIL_WIDTH_CANDIDATES[0]),
      loader,
      diagnostics,
      'thumbnail',
    );
    await loadInto(
      doc,
      versionArea,
      'versionなし',
      withoutParam(currentUrl, 'version'),
      loader,
      diagnostics,
      'thumbnail',
    );
  }
}
