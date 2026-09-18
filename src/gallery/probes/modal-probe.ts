/**
 * WU-5 Fullscreen Modal probe(P0-4)。Gallery側。
 * click → Modal.open() → Viewer DCL → first-paint を計測し、
 * Bridge events往復(gallery→viewer→gallery)を記録する。
 * iframe間はperformance.nowの原点が異なるため、横断計測はDate.now(epoch)で行う。
 */
import type { ConfluenceApi } from '../../shared/api/confluence-api';
import type { DiagnosticBuffer } from '../../shared/diagnostics/diagnostic-buffer';
import type { AttachmentSummary } from '../../shared/types/media';
import { mark } from '../../shared/probe/marks';

type OpenModal = (
  context: Record<string, unknown>,
  onClose: (payload?: unknown) => void,
) => Promise<void>;
type EmitEvent = (name: string, payload: unknown) => Promise<void>;
type OnEvent = (name: string, handler: (payload: unknown) => void) => Promise<() => void>;

export interface ModalProbeDeps {
  readonly api: ConfluenceApi;
  readonly diagnostics: DiagnosticBuffer;
  readonly openModal: OpenModal;
  readonly emitEvent: EmitEvent;
  readonly onEvent: OnEvent;
}

export async function runModalProbe(
  container: HTMLElement,
  item: AttachmentSummary,
  deps: ModalProbeDeps,
): Promise<void> {
  const doc = container.ownerDocument;
  const { diagnostics } = deps;
  const t0 = Date.now();

  const section = doc.createElement('section');
  const heading = doc.createElement('h3');
  heading.textContent = `Modal probe: ${item.attachmentId} v${item.version}(t0=${t0})`;
  const log = doc.createElement('ul');
  section.append(heading, log);
  container.append(section);
  const addLine = (text: string): void => {
    const li = doc.createElement('li');
    li.textContent = text;
    log.append(li);
  };

  // Viewer側のready/pongを先に購読してからopenする
  const offReady = await deps.onEvent('mg-viewer-ready', (payload) => {
    const p = (payload ?? {}) as Record<string, unknown>;
    const line = `viewer-ready: click→DCL=${String(p['dclDeltaMs'] ?? '-')}ms click→paint=${String(p['paintDeltaMs'] ?? '-')}ms 表示領域=${String(p['innerWidth'] ?? '-')}x${String(p['innerHeight'] ?? '-')}`;
    addLine(line);
    diagnostics.record('info', `modal ${line}`);
    // 往復計測: readyを受けてからping送出(viewer購読済みが保証される)
    void deps.emitEvent('mg-probe-ping', { sentAt: Date.now() });
  });
  const offPong = await deps.onEvent('mg-probe-pong', (payload) => {
    const sentAt = (payload as Record<string, unknown> | null)?.['sentAt'];
    const rtt = typeof sentAt === 'number' ? Date.now() - sentAt : undefined;
    const line = `events往復(gallery→viewer→gallery): ${rtt !== undefined ? `${rtt}ms` : '計測不能'}`;
    addLine(line);
    diagnostics.record('info', `modal ${line}`);
  });

  // §7.1: snapshot(JSONメタデータのみ)を渡す
  const snapshot: Record<string, unknown> = {
    probe: 'wu-5',
    t0,
    pageId: item.pageId,
    attachmentId: item.attachmentId,
    version: item.version,
    kind: item.kind,
    mediaType: item.mediaType,
    mediaUrl: deps.api.thumbnailUrl(item.attachmentId, item.version, 640),
  };

  mark('p0.modal.open-called');
  diagnostics.record('info', `modal open-called: ${item.attachmentId}(t0=${t0})`);
  try {
    await deps.openModal(snapshot, (payload) => {
      const line = `modal closed: payload=${payload === undefined ? '-' : JSON.stringify(payload)}`;
      addLine(line);
      diagnostics.record('info', line);
      offReady();
      offPong();
    });
    addLine('Modal.open() 呼び出し完了');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    addLine(`Modal.open() 失敗: ${message}`);
    diagnostics.record('error', `modal open失敗: ${message}`);
    offReady();
    offPong();
  }
}

/**
 * Viewer resourceのidle warm-up試行(L3 WU-5作業5)。
 * Gallery自身のURLから '/gallery/' → '/viewer/' の置換で推定した
 * viewer resource URLを非表示iframeでロードする(成立可否自体が計測対象)。
 */
export function attemptViewerWarmup(
  doc: Document,
  diagnostics: DiagnosticBuffer,
  statusEl?: HTMLElement,
): void {
  const setStatus = (text: string): void => {
    if (statusEl) statusEl.textContent = text;
  };
  const href = doc.defaultView?.location.href ?? '';
  const guess = href.replace('/gallery/', '/viewer/');
  if (!href || guess === href) {
    diagnostics.record('error', 'warm-up: viewer URLを推定できない(/gallery/がURLに無い)');
    setStatus('warm-up: URL推定不可');
    return;
  }
  setStatus('warm-up: 非表示iframeロード中…');
  const started = performance.now();
  const iframe = doc.createElement('iframe');
  iframe.hidden = true;
  iframe.addEventListener('load', () => {
    const message = `warm-up: 非表示iframe load ${(performance.now() - started).toFixed(0)}ms(中身の成否はDevToolsで確認)`;
    diagnostics.record('info', message);
    setStatus(message);
  });
  iframe.addEventListener('error', () => {
    diagnostics.record('error', 'warm-up: 非表示iframe error');
    setStatus('warm-up: iframe error');
  });
  iframe.src = guess;
  doc.body.append(iframe);
}
