/**
 * P0-6(WU-7)標準セッション・page size比較・レート制限ヘッダーの自動計測。
 * MG-05-Perf-50上のprobeボタンを操作し、<pre>のJSONを収集する。
 * 実行タグ: 環境変数 MG_TAG(節約策on/off比較のbuild識別に使う)。
 */
import { expect, test } from '@playwright/test';
import { findPageIdByTitle, openGalleryFrame, saveResult } from '../helpers';

const TAG = process.env['MG_TAG'] ?? 'default';

test('P0-6: 標準セッションprobe(初回+セッション内2回目)', async ({ page, request }) => {
  test.setTimeout(360_000);
  const pageId = await findPageIdByTitle(request, 'MG-05-Perf-50');
  const frame = await openGalleryFrame(page, pageId);

  const run = async (label: string) => {
    await frame.locator('button[data-action="standard-session-probe"]').click();
    const section = frame.locator('section', { hasText: '標準セッションprobe' }).last();
    await section.locator('p', { hasText: '完了' }).waitFor({ timeout: 240_000 });
    const json = (await section.locator('pre[data-probe="standard-session"]').textContent()) ?? '{}';
    const parsed = JSON.parse(json) as Record<string, unknown>;
    console.log(`${label}: total=${String(parsed['totalMs'])}ms rest=${JSON.stringify(parsed['restDelta'])}`);
    return parsed;
  };

  const first = await run('run1(初回)');
  const second = await run('run2(セッション内2回目)');
  const path = saveResult(`p0-6-session-${TAG}`, { tag: TAG, first, second });
  console.log(`result: ${path}`);
  expect(first['mediaLoads']).toBe(30);
});

test('P0-6: page size比較probe', async ({ page, request }) => {
  test.setTimeout(360_000);
  const pageId = await findPageIdByTitle(request, 'MG-05-Perf-50');
  const frame = await openGalleryFrame(page, pageId);

  await frame.locator('button[data-action="page-size-probe"]').click();
  const section = frame.locator('section', { hasText: 'page size比較probe' }).last();
  await section.locator('p', { hasText: /^完了$/ }).waitFor({ timeout: 240_000 });
  const json = (await section.locator('pre[data-probe="page-size"]').textContent()) ?? '{}';
  const parsed = JSON.parse(json) as { summary?: unknown };
  const path = saveResult(`p0-6-pagesize-${TAG}`, parsed);
  console.log(`result: ${path}`);
  console.log(JSON.stringify(parsed.summary));
  expect(parsed.summary).toBeDefined();
});

test('P0-6: レート制限ヘッダー観測(診断JSON収集)', async ({ page, request }) => {
  const pageId = await findPageIdByTitle(request, 'MG-05-Perf-50');
  const frame = await openGalleryFrame(page, pageId);

  // 一覧取得済みの状態で診断JSONを出力し、responseMetasのヘッダー記録を回収する
  await frame.locator('button', { hasText: 'JSONを出力' }).click();
  const json = (await frame.locator('textarea').inputValue()) || '{}';
  const parsed = JSON.parse(json) as { responseMetas?: { rateLimitHeaders?: Record<string, string> }[] };
  const withHeaders = (parsed.responseMetas ?? []).filter(
    (m) => Object.keys(m.rateLimitHeaders ?? {}).length > 0,
  );
  const path = saveResult(`p0-6-headers-${TAG}`, {
    total: parsed.responseMetas?.length ?? 0,
    withHeaders,
  });
  console.log(`rate-limitヘッダー付き応答: ${withHeaders.length}/${parsed.responseMetas?.length ?? 0}(${path})`);
});
