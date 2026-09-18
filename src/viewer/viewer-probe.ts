/**
 * WU-5 Viewer probe(P0-4)。Modal iframe内で動作する。
 * - 実表示領域(innerWidth/innerHeight)の記録(Forgeヘッダー有無の判定材料)
 * - Esc自前handler → close(closeOnEscape: false前提)
 * - native <video controls> にfocusがある状態のEsc確認用のvideo要素
 * - Bridge events: mg-probe-ping受信 → mg-probe-pong返送(往復計測)、mg-viewer-ready送出
 * bridge非依存(wrapperをdeps注入)でjsdomテスト可能。
 */
import type { DiagnosticBuffer } from '../shared/diagnostics/diagnostic-buffer';

export interface ViewerMetrics {
  readonly dclDeltaMs?: number;
  readonly paintDeltaMs?: number;
}

export interface ViewerProbeDeps {
  readonly context: Record<string, unknown>;
  readonly diagnostics: DiagnosticBuffer;
  readonly close: (payload?: unknown) => void;
  readonly emitEvent: (name: string, payload: unknown) => Promise<void> | void;
  readonly onEvent: (
    name: string,
    handler: (payload: unknown) => void,
  ) => Promise<() => void> | (() => void);
  readonly metrics: ViewerMetrics;
}

export async function renderViewerProbe(root: HTMLElement, deps: ViewerProbeDeps): Promise<void> {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  const { context, diagnostics } = deps;

  // §7.2: 背景は暗色、メディアは中央にcontain
  root.style.background = '#111';
  root.style.color = '#eee';
  root.style.minHeight = '100vh';
  root.style.margin = '0';

  const heading = doc.createElement('h2');
  heading.textContent = 'Viewer probe (WU-5)';
  root.append(heading);

  const info = doc.createElement('dl');
  const addInfo = (key: string, value: string): void => {
    const dt = doc.createElement('dt');
    dt.textContent = key;
    const dd = doc.createElement('dd');
    dd.textContent = value;
    info.append(dt, dd);
  };
  addInfo('innerWidth × innerHeight', `${win?.innerWidth ?? '-'} × ${win?.innerHeight ?? '-'}`);
  addInfo('screen', `${win?.screen?.width ?? '-'} × ${win?.screen?.height ?? '-'}`);
  addInfo('click→DCL', deps.metrics.dclDeltaMs !== undefined ? `${deps.metrics.dclDeltaMs}ms` : '-');
  addInfo(
    'click→first-paint',
    deps.metrics.paintDeltaMs !== undefined ? `${deps.metrics.paintDeltaMs}ms` : '-',
  );
  root.append(info);

  // 閉じる操作(hit area 44px — §7.2)
  const closeButton = doc.createElement('button');
  closeButton.type = 'button';
  closeButton.dataset['action'] = 'viewer-close';
  closeButton.textContent = '閉じる(view.close)';
  closeButton.style.minWidth = '44px';
  closeButton.style.minHeight = '44px';
  closeButton.addEventListener('click', () => {
    diagnostics.record('info', 'viewer: closeボタン → view.close');
    deps.close({ reason: 'close-button' });
  });
  root.append(closeButton);

  // Esc自前handler(closeOnEscape: false前提。§7.3)
  doc.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      diagnostics.record('info', 'viewer: Esc捕捉 → view.close');
      deps.close({ reason: 'escape' });
    }
  });

  // native <video controls> focus状態のEsc確認用(sourceなしでfocus可能)
  const video = doc.createElement('video');
  video.controls = true;
  video.style.width = '320px';
  video.style.display = 'block';
  const videoNote = doc.createElement('p');
  videoNote.textContent = '↑ video controlsにfocusを移してからEscを押す(手順書の確認項目)';
  root.append(video, videoNote);

  // メディア表示(snapshotのmediaUrl。§7.1のsnapshot経由)
  const mediaUrl = typeof context['mediaUrl'] === 'string' ? context['mediaUrl'] : undefined;
  if (mediaUrl) {
    const img = doc.createElement('img');
    img.src = mediaUrl;
    img.style.maxWidth = '90vw';
    img.style.maxHeight = '60vh';
    img.style.objectFit = 'contain';
    img.style.display = 'block';
    img.style.margin = '8px auto';
    img.addEventListener('load', () => {
      diagnostics.record('info', `viewer: media表示成立(natural ${img.naturalWidth}x${img.naturalHeight})`);
    });
    img.addEventListener('error', () => {
      diagnostics.record('error', 'viewer: media表示失敗');
    });
    root.append(img);
  } else {
    addInfo('mediaUrl', 'contextに無し');
  }

  // events往復: ping受信 → pongへecho(payloadそのまま返す)
  await deps.onEvent('mg-probe-ping', (payload) => {
    diagnostics.record('info', 'viewer: mg-probe-ping受信 → pong返送');
    void deps.emitEvent('mg-probe-pong', payload);
  });

  // Galleryへready通知(計測メタデータのみ)
  await deps.emitEvent('mg-viewer-ready', {
    dclDeltaMs: deps.metrics.dclDeltaMs ?? null,
    paintDeltaMs: deps.metrics.paintDeltaMs ?? null,
    innerWidth: win?.innerWidth ?? null,
    innerHeight: win?.innerHeight ?? null,
  });
  diagnostics.record('info', 'viewer: mg-viewer-ready送出');
}
