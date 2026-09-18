/**
 * Modal側のcontext取得とclose(WU-5)。`@forge/bridge` のimportはsrc/shared/api/に閉じる。
 */
import { view } from '@forge/bridge';

export async function getModalContext(): Promise<Record<string, unknown>> {
  const context = (await view.getContext()) as { extension?: { modal?: unknown } };
  const modal = context.extension?.modal;
  return modal && typeof modal === 'object' ? (modal as Record<string, unknown>) : {};
}

export function closeView(payload?: unknown): void {
  void view.close(payload);
}
