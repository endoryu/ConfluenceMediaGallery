/**
 * thumbキャッシュ添付の命名規則(V1 §5.2)。
 * `mg_thumbcache_<attachmentId>_v<version>_w<width>`(拡張子なし)。
 * ファイル名だけで所有者(本アプリ)・対象・版・サイズを一意に判定できる。
 * 書込み系は必ずassertThumbcacheWriteTarget()を通す(Phase1_Spec §5.3)。
 */

export const THUMBCACHE_PREFIX = 'mg_thumbcache_';

/** ページ単位の整合データ(台帳・無効化フラグ。V1 §5.2) */
export const THUMBCACHE_CONFIG_NAME = 'mg_thumbcache_config';

const NAME_PATTERN = /^mg_thumbcache_(\d+)_v(\d+)_w(\d+)$/;

export interface ThumbcacheName {
  readonly targetAttachmentId: string;
  readonly targetVersion: number;
  readonly width: number;
}

/** 命名規則に完全一致する場合のみ解析結果を返す(configはnull) */
export function parseThumbcacheName(title: string): ThumbcacheName | null {
  const match = NAME_PATTERN.exec(title);
  if (!match?.[1] || !match[2] || !match[3]) return null;
  return {
    targetAttachmentId: match[1],
    targetVersion: Number(match[2]),
    width: Number(match[3]),
  };
}

export function buildThumbcacheName(
  targetAttachmentId: string,
  targetVersion: number,
  width: number,
): string {
  const name = `${THUMBCACHE_PREFIX}${targetAttachmentId}_v${targetVersion}_w${width}`;
  assertThumbcacheWriteTarget(name);
  return name;
}

/** prefix一致(config含む)。グリッド除外の判定に使う */
export function isThumbcacheTitle(title: string): boolean {
  return title.startsWith(THUMBCACHE_PREFIX);
}

export function isThumbcacheConfigTitle(title: string): boolean {
  return title === THUMBCACHE_CONFIG_NAME;
}

/**
 * 書込み先ファイル名のガード。命名規則外への書込みAPI呼び出しを
 * コードパス上不可能にする(Phase1_Spec §5.3)。
 */
export function assertThumbcacheWriteTarget(fileName: string): void {
  if (fileName === THUMBCACHE_CONFIG_NAME) return;
  if (NAME_PATTERN.test(fileName)) return;
  throw new Error(`thumbキャッシュ命名規則外への書込みは禁止: ${fileName}`);
}
