/**
 * Viewer entry(WU-0 scaffold placeholder)。
 * Fullscreen Viewer probe は WU-5 で実装する(Phase0_Spec §WU-5)。
 * Viewerコードは Gallery bundle に含めない(CLAUDE.md §8)。
 */
import { DiagnosticBuffer } from '../shared/diagnostics/diagnostic-buffer';
import { registerGlobalErrorHandler } from '../shared/diagnostics/global-error-handler';

const diagnostics = new DiagnosticBuffer();
registerGlobalErrorHandler(diagnostics);
diagnostics.record('info', 'viewer: scaffold loaded');

const app = document.getElementById('app');
if (app) {
  const p = document.createElement('p');
  p.textContent = 'Media Gallery viewer scaffold (WU-0)';
  app.append(p);
}
