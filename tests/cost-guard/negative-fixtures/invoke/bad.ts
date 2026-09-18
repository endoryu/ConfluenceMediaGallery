import { invoke } from '@forge/bridge';

export async function callResolver(): Promise<unknown> {
  return invoke('resolver-fn');
}
