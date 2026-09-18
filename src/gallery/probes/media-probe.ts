/**
 * WU-4 動画・音声 Range/seek probe(P0-3)。
 * - `<video>`/`<audio>` を preload=metadata・native controls で生成(V1 §7.6/§7.7)
 * - loadedmetadata到達時刻、seek(seeking→seeked)遅延、waiting/stalled、bufferedを記録
 * - 連続seekボタン(25%→50%→75%)、close相当(pause→src解除→load())ボタン
 * Range/206/転送量の正本はDevTools(cross-originのためJSからは読めない)。
 */
import type { ConfluenceApi } from '../../shared/api/confluence-api';
import type { DiagnosticBuffer } from '../../shared/diagnostics/diagnostic-buffer';
import type { AttachmentSummary } from '../../shared/types/media';
import { stripQuery } from './probe-dom';

export interface MediaProbeOptions {
  readonly api: ConfluenceApi;
  readonly diagnostics: DiagnosticBuffer;
}

function formatBuffered(el: HTMLMediaElement): string {
  const parts: string[] = [];
  for (let i = 0; i < el.buffered.length; i += 1) {
    parts.push(`${el.buffered.start(i).toFixed(1)}-${el.buffered.end(i).toFixed(1)}s`);
  }
  return parts.length > 0 ? parts.join(', ') : '(なし)';
}

export function runMediaProbe(
  container: HTMLElement,
  item: AttachmentSummary,
  options: MediaProbeOptions,
): void {
  const doc = container.ownerDocument;
  const { api, diagnostics } = options;
  const url = api.originalUrl(item.pageId, item.attachmentId, item.version);
  const label = `${item.kind} ${item.attachmentId} v${item.version}`;

  const section = doc.createElement('section');
  const heading = doc.createElement('h3');
  heading.textContent = `Media probe: ${label}(${item.mediaType})`;
  section.append(heading);
  container.append(section);

  const el: HTMLMediaElement =
    item.kind === 'video' ? doc.createElement('video') : doc.createElement('audio');
  el.controls = true;
  el.preload = 'metadata';
  if (el instanceof HTMLVideoElement) {
    el.style.maxWidth = '480px';
    el.style.display = 'block';
  }

  const log = doc.createElement('ul');
  const addLine = (text: string, isError = false): void => {
    const li = doc.createElement('li');
    li.textContent = text;
    log.append(li);
    diagnostics.record(isError ? 'error' : 'info', `media ${label}: ${text} (${stripQuery(url)})`);
  };

  const bufferedLine = doc.createElement('p');
  const updateBuffered = (): void => {
    bufferedLine.textContent = `buffered: ${formatBuffered(el)} / duration: ${Number.isFinite(el.duration) ? el.duration.toFixed(1) : '-'}s / readyState: ${el.readyState}`;
  };

  const srcSetAt = performance.now();
  const since = (): string => `${(performance.now() - srcSetAt).toFixed(0)}ms`;

  el.addEventListener('loadedmetadata', () => {
    const dims =
      el instanceof HTMLVideoElement ? ` ${el.videoWidth}x${el.videoHeight}` : '';
    addLine(
      `loadedmetadata: +${since()} duration=${el.duration.toFixed(1)}s${dims}(この時点の転送量はDevToolsで読む)`,
    );
    updateBuffered();
  });
  el.addEventListener('canplay', () => addLine(`canplay: +${since()}`));
  el.addEventListener('playing', () => {
    addLine(`playing: +${since()} currentTime=${el.currentTime.toFixed(1)}s buffered=${formatBuffered(el)}`);
  });
  el.addEventListener('waiting', () => addLine(`waiting(バッファ待ち): currentTime=${el.currentTime.toFixed(1)}s`));
  el.addEventListener('stalled', () => addLine('stalled'));
  let seekingAt = 0;
  el.addEventListener('seeking', () => {
    seekingAt = performance.now();
    addLine(`seeking → ${el.currentTime.toFixed(1)}s(buffered=${formatBuffered(el)})`);
  });
  el.addEventListener('seeked', () => {
    addLine(`seeked: ${(performance.now() - seekingAt).toFixed(0)}msで完了(→${el.currentTime.toFixed(1)}s)`);
    updateBuffered();
  });
  el.addEventListener('progress', updateBuffered);
  el.addEventListener('timeupdate', updateBuffered);
  el.addEventListener('error', () => {
    addLine(`error: code=${el.error?.code ?? '-'}(再生不可)`, true);
  });

  el.src = url;
  addLine('src設定(preload=metadata)');

  const controls = doc.createElement('div');
  const playButton = doc.createElement('button');
  playButton.type = 'button';
  playButton.dataset['action'] = 'media-play';
  playButton.textContent = '再生';
  playButton.addEventListener('click', () => {
    addLine(`再生操作: +${since()}`);
    try {
      void el.play()?.catch((error: unknown) => {
        addLine(`play()拒否: ${error instanceof Error ? error.name : 'unknown'}`, true);
      });
    } catch {
      addLine('play()例外', true);
    }
  });

  const seekButton = doc.createElement('button');
  seekButton.type = 'button';
  seekButton.dataset['action'] = 'media-seek';
  seekButton.textContent = '連続seek(25→50→75%)';
  seekButton.addEventListener('click', () => {
    if (!Number.isFinite(el.duration) || el.duration <= 0) {
      addLine('連続seek不可: durationが未確定', true);
      return;
    }
    const targets = [0.25, 0.5, 0.75].map((r) => el.duration * r);
    addLine(`連続seek開始: ${targets.map((t) => t.toFixed(1)).join(' → ')}s`);
    let i = 0;
    const step = (): void => {
      const target = targets[i];
      if (target === undefined) return;
      el.currentTime = target;
      i += 1;
      if (i < targets.length) setTimeout(step, 400);
    };
    step();
  });

  const releaseButton = doc.createElement('button');
  releaseButton.type = 'button';
  releaseButton.dataset['action'] = 'media-release';
  releaseButton.textContent = 'close相当(pause→src解除→load)';
  releaseButton.addEventListener('click', () => {
    el.pause();
    el.removeAttribute('src');
    el.load();
    addLine('close相当を実行(pause→src解除→load。メモリ解放はDevTools Memoryで確認)');
  });

  controls.append(playButton, seekButton, releaseButton);
  section.append(el, bufferedLine, controls, log);
  updateBuffered();
}
