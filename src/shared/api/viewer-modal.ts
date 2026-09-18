/**
 * Fullscreen Modal起動wrapper(WU-5)。`@forge/bridge` のimportはsrc/shared/api/に閉じる。
 * V1仕様書 §4.1: size fullscreen、title/icon未指定、closeOnEscape: false。
 */
import { Modal } from '@forge/bridge';

export type ModalCloseHandler = (payload?: unknown) => void;

export async function openViewerModal(
  context: Record<string, unknown>,
  onClose: ModalCloseHandler,
): Promise<void> {
  const options = {
    resource: 'viewer',
    size: 'fullscreen',
    closeOnEscape: false,
    context,
    onClose,
  } as unknown as ConstructorParameters<typeof Modal>[0];
  const modal = new Modal(options);
  await modal.open();
}
