/**
 * Viewer entry(Phase 2)。
 * WU-0: 静的shell(§7.2)。WU-1でsnapshot受領→即座に画像URL設定(§13.3)、
 * WU-2で2段表示、WU-3でナビゲーションを接続する。
 * ViewerコードはGallery bundleに含めない(CLAUDE.md §8)。
 */
import './viewer.css';
import { DiagnosticBuffer } from '../shared/diagnostics/diagnostic-buffer';
import { registerGlobalErrorHandler } from '../shared/diagnostics/global-error-handler';
import { mark } from '../shared/diagnostics/marks';

// module評価時点 ≈ DOMContentLoaded(type=module はdeferred実行)
mark('p2.viewer.dcl');

const diagnostics = new DiagnosticBuffer();
registerGlobalErrorHandler(diagnostics);
// 診断バッファの画面内読み出し口(E2E・手動診断用。console/外部へは出さない — §8)
(globalThis as unknown as { __MG_DIAG__?: () => unknown }).__MG_DIAG__ = () =>
  diagnostics.snapshot();

diagnostics.record('info', 'viewer: shell描画(WU-0)');
