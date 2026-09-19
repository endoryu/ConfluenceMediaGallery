/**
 * 数値パラメータの集約モジュール(CLAUDE.md §8、V1仕様書 §18対応)。
 * 変更時はcommit messageに理由を記す。
 */

/** 診断バッファの保持上限(V1仕様書 §8.4「直近50件」) */
export const DIAGNOSTIC_BUFFER_LIMIT = 50;

/** Attachment一覧の既定page size(Phase0_Spec §11。WU-7で25/50/100/250を比較) */
export const DEFAULT_LIST_LIMIT = 50;

/** Thumbnail width候補(Phase0_Spec §11、V1仕様書 §6.3の上限640) */
export const THUMBNAIL_WIDTH_CANDIDATES = [320, 640] as const;

/** レート制限probe発火閾値: この時間窓内のmedia load失敗数(V1仕様書 §18) */
export const RATE_PROBE_FAILURE_WINDOW_MS = 10_000;
export const RATE_PROBE_FAILURE_THRESHOLD = 3;
/** レート制限probe最小間隔と指数バックオフ上限(V1仕様書 §18) */
export const RATE_PROBE_MIN_INTERVAL_MS = 30_000;
export const RATE_PROBE_MAX_INTERVAL_MS = 300_000;
/** Retry-After不明時のBlocked既定待機(§11.1のRetry-After欠落時fallback) */
export const RATE_BLOCKED_DEFAULT_MS = 60_000;
/** 待機表示の切替閾値(V1仕様書 §18。UIはPhase 2) */
export const RATE_WAIT_DISPLAY_THRESHOLD_S = 60;

/** 標準セッションのViewer表示件数(V1仕様書 §4.5.4) */
export const STANDARD_SESSION_VIEW_COUNT = 30;
/** page size比較の候補(Phase0_Spec §11) */
export const PAGE_SIZE_CANDIDATES = [25, 50, 100, 250] as const;
