/**
 * Gallery entry(Phase 1)。
 * WU-0: probe撤去後の最小shell。WU-1でV1 §6.1の初期化手順(静的背景即描画→
 * context取得→一覧pagination→逐次描画)をここに実装する。
 */
import { DiagnosticBuffer } from '../shared/diagnostics/diagnostic-buffer';
import { registerGlobalErrorHandler } from '../shared/diagnostics/global-error-handler';
import { mark } from '../shared/diagnostics/marks';

// module評価時点 ≈ DOMContentLoaded(type=module はdeferred実行)
mark('p1.gallery.dcl');

const diagnostics = new DiagnosticBuffer();
registerGlobalErrorHandler(diagnostics);

const app = document.getElementById('app');
if (app) {
  const region = document.createElement('div');
  region.className = 'mg-gallery';
  region.setAttribute('role', 'region');
  region.setAttribute('aria-label', 'Media Gallery');
  app.append(region);
  diagnostics.record('info', 'gallery: shell描画(WU-0)');
}
