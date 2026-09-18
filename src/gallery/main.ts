/**
 * Gallery entry(WU-0 scaffold placeholder)。
 * probe UI 本体は WU-1 で実装する(Phase0_Spec §WU-1)。
 */
import { DiagnosticBuffer } from '../shared/diagnostics/diagnostic-buffer';
import { registerGlobalErrorHandler } from '../shared/diagnostics/global-error-handler';

const diagnostics = new DiagnosticBuffer();
registerGlobalErrorHandler(diagnostics);
diagnostics.record('info', 'gallery: scaffold loaded');

const app = document.getElementById('app');
if (app) {
  const p = document.createElement('p');
  p.textContent = 'Media Gallery probe scaffold (WU-0)';
  app.append(p);
}
