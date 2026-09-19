/**
 * Viewer entry(Phase 2まで空shell)。
 * ViewerコードはGallery bundleに含めない(CLAUDE.md §8)。Phase 1のGalleryは
 * Modalを開かないため、本entryは到達不能な待機shellとして維持する。
 */
import { DiagnosticBuffer } from '../shared/diagnostics/diagnostic-buffer';
import { registerGlobalErrorHandler } from '../shared/diagnostics/global-error-handler';
import { mark } from '../shared/diagnostics/marks';

mark('p1.viewer.dcl');

const diagnostics = new DiagnosticBuffer();
registerGlobalErrorHandler(diagnostics);
diagnostics.record('info', 'viewer: 空shell(Phase 2で実装)');
