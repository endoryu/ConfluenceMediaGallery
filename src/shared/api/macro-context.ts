/**
 * Macro contextの取得。`@forge/bridge` のimportは src/shared/api/ に閉じる(CLAUDE.md §8)。
 */
import { view } from '@forge/bridge';

export interface MacroContext {
  readonly pageId: string;
  readonly siteBaseUrl: string;
}

interface ForgeViewContext {
  siteUrl?: string;
  extension?: { content?: { id?: string } };
}

export async function getMacroContext(): Promise<MacroContext> {
  const context = (await view.getContext()) as ForgeViewContext;
  const pageId = context.extension?.content?.id;
  const siteBaseUrl = context.siteUrl;
  if (!pageId || !siteBaseUrl) {
    throw new Error('macro contextからpageId/siteUrlを取得できない');
  }
  return { pageId, siteBaseUrl };
}
