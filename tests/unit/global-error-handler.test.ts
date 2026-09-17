// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { DiagnosticBuffer } from '../../src/shared/diagnostics/diagnostic-buffer';
import { registerGlobalErrorHandler } from '../../src/shared/diagnostics/global-error-handler';

describe('registerGlobalErrorHandler', () => {
  it('errorイベントを診断バッファへ記録し、consoleを呼ばない', () => {
    const buffer = new DiagnosticBuffer();
    registerGlobalErrorHandler(buffer);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    window.dispatchEvent(new ErrorEvent('error', { error: new Error('boom'), message: 'boom' }));

    expect(buffer.size).toBe(1);
    expect(buffer.snapshot()[0]).toMatchObject({ kind: 'error', message: 'Error: boom' });
    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('unhandledrejectionを記録する', () => {
    const buffer = new DiagnosticBuffer();
    registerGlobalErrorHandler(buffer);

    // jsdomはPromiseRejectionEventを実装しないため、同名イベントで代用する
    window.dispatchEvent(new Event('unhandledrejection'));

    expect(buffer.size).toBe(1);
    expect(buffer.snapshot()[0]?.kind).toBe('unhandledrejection');
  });

  it('Errorでないreasonも定型化して記録する', () => {
    const buffer = new DiagnosticBuffer();
    registerGlobalErrorHandler(buffer);

    window.dispatchEvent(new ErrorEvent('error', { message: 'plain message' }));

    expect(buffer.snapshot()[0]?.message).toBe('plain message');
  });
});
