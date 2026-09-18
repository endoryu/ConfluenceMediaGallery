/**
 * 計測・診断出力は画面内のtextareaへ(CLAUDE.md §8、Phase0_Spec §5.5)。
 * console・Forge・外部へは出さない。
 */
import type { DiagnosticBuffer } from '../diagnostics/diagnostic-buffer';
import type { ResponseMeta } from '../api/confluence-api';
import { snapshotMarks } from './marks';
import type { RequestInventory } from './request-inventory';

export class DiagnosticsPanel {
  private readonly textarea: HTMLTextAreaElement;
  private readonly responseMetas: ResponseMeta[] = [];

  constructor(
    parent: HTMLElement,
    private readonly buffer: DiagnosticBuffer,
    private readonly inventory: RequestInventory,
    doc: Document = document,
  ) {
    const section = doc.createElement('section');
    const heading = doc.createElement('h2');
    heading.textContent = '計測・診断出力(JSON)';
    const dumpButton = doc.createElement('button');
    dumpButton.type = 'button';
    dumpButton.textContent = 'JSONを出力';
    this.textarea = doc.createElement('textarea');
    this.textarea.rows = 14;
    this.textarea.style.width = '100%';
    this.textarea.readOnly = true;
    dumpButton.addEventListener('click', () => this.dump());
    section.append(heading, dumpButton, this.textarea);
    parent.append(section);
  }

  recordResponseMeta(meta: ResponseMeta): void {
    this.responseMetas.push(meta);
  }

  dump(): void {
    this.textarea.value = JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        marks: snapshotMarks(),
        requestInventory: this.inventory.snapshot(),
        responseMetas: this.responseMetas,
        diagnostics: this.buffer.snapshot(),
      },
      null,
      2,
    );
  }
}
