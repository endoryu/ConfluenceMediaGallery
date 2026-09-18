/**
 * Forge Bridge `events` のwrapper(WU-5: Gallery⇄Modal iframe間のJSONメタデータ同期)。
 * `@forge/bridge` のimportはsrc/shared/api/に閉じる。payloadはJSONメタデータのみ(V1 §4.2)。
 */
import { events } from '@forge/bridge';

export type ProbeEventHandler = (payload: unknown) => void;
export type Unsubscribe = () => void;

export async function onProbeEvent(name: string, handler: ProbeEventHandler): Promise<Unsubscribe> {
  const subscription = await events.on(name, handler);
  return () => {
    void subscription.unsubscribe();
  };
}

export async function emitProbeEvent(name: string, payload: unknown): Promise<void> {
  await events.emit(name, payload);
}
