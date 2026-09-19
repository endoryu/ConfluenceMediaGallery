/**
 * WU-1 probe UI: Attachment一覧を表形式で表示し、各行に
 * Thumbnail / Original / Modal のprobeボタンを置く(Phase0_Spec §WU-1 作業4)。
 * probe動作本体はWU-2(Thumbnail)、WU-3(Original)、WU-5(Modal)で実装する。
 * 通信はadapter interface越しのみ。@forge/bridge へ依存しない。
 */
import type { ConfluenceApi } from '../shared/api/confluence-api';
import type { DiagnosticBuffer } from '../shared/diagnostics/diagnostic-buffer';
import type { AttachmentSummary } from '../shared/types/media';
import { DEFAULT_LIST_LIMIT } from '../shared/constants';
import { mark, measure } from '../shared/probe/marks';

export type ProbeAction = 'thumbnail' | 'original' | 'modal';

export interface ProbeUiOptions {
  readonly pageId: string;
  readonly api: ConfluenceApi;
  readonly diagnostics: DiagnosticBuffer;
  /** probeボタン押下時のhandler。WU-2/3/5で差し替える */
  readonly onProbe?: (action: ProbeAction, item: AttachmentSummary) => void;
}

async function fetchAllPages(
  api: ConfluenceApi,
  pageId: string,
): Promise<readonly AttachmentSummary[]> {
  const items: AttachmentSummary[] = [];
  let cursor: string | undefined;
  do {
    const page = await api.listAttachments(pageId, cursor, DEFAULT_LIST_LIMIT);
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor !== undefined);
  return items;
}

export async function renderProbeUi(
  root: HTMLElement,
  options: ProbeUiOptions,
): Promise<readonly AttachmentSummary[]> {
  const doc = root.ownerDocument;
  const { api, pageId, diagnostics } = options;

  const status = doc.createElement('p');
  status.textContent = 'Attachment一覧を取得中…';
  root.append(status);

  mark('p0.api.list.start');
  let items: readonly AttachmentSummary[];
  try {
    items = await fetchAllPages(api, pageId);
  } catch (error) {
    diagnostics.record(
      'error',
      `attachment一覧の取得に失敗(${error instanceof Error ? error.message : 'unknown'})`,
    );
    status.textContent = 'Attachment一覧を取得できませんでした(診断出力を参照)';
    return [];
  }
  mark('p0.api.list.end');
  measure('p0.api.list.start→p0.api.list.end', 'p0.api.list.start', 'p0.api.list.end');

  if (items.length === 0) {
    status.textContent = 'このページにAttachmentはありません';
    return items;
  }
  status.textContent = `Attachment ${items.length}件`;

  const table = doc.createElement('table');
  const thead = doc.createElement('thead');
  const headRow = doc.createElement('tr');
  for (const label of ['attachmentId', 'version', 'mediaType', 'kind', 'probe']) {
    const th = doc.createElement('th');
    th.textContent = label;
    headRow.append(th);
  }
  thead.append(headRow);
  const tbody = doc.createElement('tbody');

  for (const item of items) {
    const row = doc.createElement('tr');
    for (const value of [item.attachmentId, String(item.version), item.mediaType, item.kind]) {
      const td = doc.createElement('td');
      td.textContent = value;
      row.append(td);
    }
    const actions = doc.createElement('td');
    for (const action of ['thumbnail', 'original', 'modal'] as const) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.dataset['action'] = action;
      button.dataset['attachmentId'] = item.attachmentId;
      button.textContent = { thumbnail: 'Thumbnail', original: 'Original', modal: 'Modal' }[action];
      button.addEventListener('click', () => {
        mark('p0.click');
        if (options.onProbe) {
          options.onProbe(action, item);
        } else {
          diagnostics.record('info', `probe未実装: ${action}(WU-2/3/5で実装)`);
        }
      });
      actions.append(button);
    }
    row.append(actions);
    tbody.append(row);
  }
  table.append(thead, tbody);
  root.append(table);
  return items;
}
