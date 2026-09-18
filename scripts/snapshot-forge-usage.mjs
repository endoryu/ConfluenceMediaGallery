#!/usr/bin/env node
/**
 * Usage snapshot 記録補助(audit:usage)。
 * WU-8 で実装する。実装までは手動確認手順(ガイド §8.5、Phase0_Spec WU-8)へ切り替える。
 * 本scriptは通信を行わない。認証情報を扱う自動取得はユーザーが認証情報管理を
 * 承認した場合のみ、別途実装する(V1仕様書 §4.7.3)。
 */
import process from 'node:process';

process.stdout.write(
  [
    'audit:usage: 未実装(WU-8で実装予定)。手動確認へ切り替えてください。',
    '  1. ユーザーがDeveloper Console「Usage and costs」を確認(全メトリクス0、USD 0.00)',
    '  2. ユーザーがBilling Consoleで支払方法未登録を確認',
    '  3. screenshotの原本は local/ へ保存(commit禁止)',
    '  4. sanitize済みsnapshotを docs/operations/usage-snapshots/ へ記録',
    '',
  ].join('\n'),
);
process.exitCode = 2; // 未実装。fail closed(取得失敗は手動確認へ)
