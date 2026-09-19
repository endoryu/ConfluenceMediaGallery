import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Viewer静的shellの構造ガード(V1 §7.2、Phase2_Spec WU-0)。
 * 静的HTMLはJS実行前から存在するため、fileベースで必須要素を検査する。
 */
const html = readFileSync('src/viewer/index.html', 'utf8');
const css = readFileSync('src/viewer/viewer.css', 'utf8');

describe('viewer shell(§7.2)', () => {
  it('必須要素が静的HTMLに存在する', () => {
    expect(html).toContain('class="mgv-viewer"');
    expect(html).toContain('class="mgv-stage"');
    expect(html).toContain('class="mgv-image"');
    expect(html).toContain('mgv-nav--prev');
    expect(html).toContain('mgv-nav--next');
    expect(html).toContain('class="mgv-status"');
  });

  it('前後ボタンはaria-labelを持ち初期disabled、閉じる/≡ボタンは置かない', () => {
    expect(html).toContain('aria-label="前のメディア"');
    expect(html).toContain('aria-label="次のメディア"');
    expect((html.match(/<button/g) ?? []).length).toBe(2); // Forgeヘッダーのcloseが正、≡はP4
    expect(html).toMatch(/mgv-nav--prev"[^>]*disabled/s);
  });

  it('CSSにhit area token(44px)とcontain・即時切替(transitionなし)がある', () => {
    expect(css).toContain('--mgv-hit: 44px');
    expect(css).toContain('object-fit: contain');
    // プロパティとしての使用を禁止(コメント中の語は許容)
    expect(css).not.toMatch(/^\s*transition\s*:/m);
    expect(css).not.toMatch(/^\s*animation\s*:/m);
  });
});
