/**
 * WU-6 scope probe(P0-5/P0-8後半)。
 * - users-bulk疎通: read:user:confluence の実呼び出し確認(L3 WU-6作業6)
 * - G2 write probe: mg_thumbcache_* のupload→版更新→削除roundtrip(L3 WU-6作業9)。
 *   対象は自己管理命名の添付のみ。ユーザーコンテンツに触れない。
 */
import type { ConfluenceApi, WriteProbeApi } from '../../shared/api/confluence-api';
import type { DiagnosticBuffer } from '../../shared/diagnostics/diagnostic-buffer';
import type { AttachmentSummary } from '../../shared/types/media';

export const G2_PROBE_FILENAME = 'mg_thumbcache_g2probe_v1_w320';

export async function runUsersBulkProbe(
  statusEl: HTMLElement,
  items: readonly AttachmentSummary[],
  api: ConfluenceApi,
  diagnostics: DiagnosticBuffer,
): Promise<void> {
  const accountIds = [...new Set(items.map((i) => i.authorId).filter((a): a is string => !!a))];
  if (accountIds.length === 0) {
    statusEl.textContent = 'users-bulk: authorIdが一覧に無く実行不可';
    diagnostics.record('error', 'users-bulk probe: authorIdなし');
    return;
  }
  statusEl.textContent = 'users-bulk: 実行中…';
  try {
    const users = await api.resolveUsers(accountIds.slice(0, 5));
    const message = `users-bulk: 成立(${users.length}件解決)`;
    statusEl.textContent = message;
    diagnostics.record('info', `scope probe ${message}`);
  } catch (error) {
    const message = `users-bulk: 失敗(${error instanceof Error ? error.message : 'unknown'})`;
    statusEl.textContent = message;
    diagnostics.record('error', `scope probe ${message}`);
  }
}

function makeTinyJpegBlob(doc: Document): Promise<Blob | null> {
  const canvas = doc.createElement('canvas');
  canvas.width = 8;
  canvas.height = 8;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  ctx.fillStyle = '#3366cc';
  ctx.fillRect(0, 0, 8, 8);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.8));
}

export async function runG2WriteProbe(
  statusEl: HTMLElement,
  pageId: string,
  api: WriteProbeApi,
  diagnostics: DiagnosticBuffer,
  doc: Document,
): Promise<void> {
  const report = (message: string, isError = false): void => {
    statusEl.textContent = message;
    diagnostics.record(isError ? 'error' : 'info', `G2 probe: ${message}`);
  };
  const blob = await makeTinyJpegBlob(doc);
  if (!blob) {
    report('G2: canvas Blob生成不可', true);
    return;
  }
  report('G2: upload中…');
  const uploaded = await api.uploadAttachment(pageId, G2_PROBE_FILENAME, blob);
  if (!uploaded.attachmentId) {
    report(`G2: upload失敗 status=${uploaded.status} ${uploaded.note ?? ''}`, true);
    return;
  }
  report(`G2: upload成立(${uploaded.attachmentId})→ 版更新中…`);
  const updated = await api.updateAttachmentData(pageId, uploaded.attachmentId, G2_PROBE_FILENAME, blob);
  if (updated.status < 200 || updated.status >= 300) {
    report(`G2: 版更新失敗 status=${updated.status}(upload=${uploaded.attachmentId}は残存。手動削除可)`, true);
    return;
  }
  report('G2: 版更新成立 → 削除中…');
  const deleted = await api.deleteAttachment(uploaded.attachmentId);
  if (deleted.status !== 204 && deleted.status !== 200) {
    report(`G2: 削除失敗 status=${deleted.status}(${uploaded.attachmentId}残存)`, true);
    return;
  }
  report(`G2: 全roundtrip成立(upload ${uploaded.status}→update ${updated.status}→delete ${deleted.status})`);
}
