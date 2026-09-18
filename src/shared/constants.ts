/**
 * 数値パラメータの集約モジュール(CLAUDE.md §8、V1仕様書 §18対応)。
 * 変更時はcommit messageに理由を記す。
 */

/** 診断バッファの保持上限(V1仕様書 §8.4「直近50件」) */
export const DIAGNOSTIC_BUFFER_LIMIT = 50;

/** Attachment一覧の既定page size(Phase0_Spec §11。WU-7で25/50/100/250を比較) */
export const DEFAULT_LIST_LIMIT = 50;
