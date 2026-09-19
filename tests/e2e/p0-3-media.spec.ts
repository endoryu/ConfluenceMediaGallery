/**
 * P0-3(WU-4)動画・音声 Range/seek の自動計測(ガイド §7.1半自動方式)。
 * 前提: scripts/e2e-login.mjs で local/storageState.json 作成済み、
 *       MG-03-Video-Audio にMG03-*ファイルが添付済み。
 * 非破壊probe(閲覧系操作のみ)。結果JSONは local/e2e-results/ へ。
 */
import { expect, test } from '@playwright/test';
import type { Frame, Page } from '@playwright/test';
import {
  NetworkRecorder,
  clickProbeButton,
  findPageIdByTitle,
  listAttachments,
  openGalleryFrame,
  saveResult,
} from './helpers';

const isMediaHostPath = (hostPath: string): boolean =>
  hostPath.includes('/child/attachment/') || hostPath.includes('media.atlassian.com');

async function lastSection(frame: Frame) {
  return frame.locator('section', { hasText: 'Media probe:' }).last();
}

async function waitLogLine(frame: Frame, pattern: RegExp, timeout = 60_000): Promise<string> {
  const section = await lastSection(frame);
  const line = section.locator('li').filter({ hasText: pattern }).first();
  await line.waitFor({ timeout });
  return (await line.textContent()) ?? '';
}

async function muteAndPlay(frame: Frame): Promise<void> {
  const section = await lastSection(frame);
  await section
    .locator('video, audio')
    .first()
    .evaluate((el) => {
      (el as HTMLMediaElement).muted = true;
    });
  await section.locator('button[data-action="media-play"]').click();
}

interface MediaState {
  currentTime: number;
  duration: number;
  bufferedEnd: number;
  readyState: number;
}

async function readMediaState(frame: Frame): Promise<MediaState> {
  const section = await lastSection(frame);
  return section
    .locator('video, audio')
    .first()
    .evaluate((node) => {
      const el = node as HTMLMediaElement;
      return {
        currentTime: el.currentTime,
        duration: el.duration,
        bufferedEnd: el.buffered.length > 0 ? el.buffered.end(el.buffered.length - 1) : 0,
        readyState: el.readyState,
      };
    });
}

async function seekTo(frame: Frame, ratio: number): Promise<void> {
  const section = await lastSection(frame);
  await section
    .locator('video, audio')
    .first()
    .evaluate((node, r) => {
      const el = node as HTMLMediaElement;
      el.currentTime = el.duration * r;
    }, ratio);
}

async function setup(page: Page, request: Parameters<typeof findPageIdByTitle>[0]) {
  const pageId = await findPageIdByTitle(request, 'MG-03-Video-Audio');
  const attachments = await listAttachments(request, pageId);
  const recorder = new NetworkRecorder(page, isMediaHostPath);
  const frame = await openGalleryFrame(page, pageId);
  return { pageId, attachments, recorder, frame };
}

function byTitle(attachments: { title: string; id: string }[], title: string): string {
  const found = attachments.find((a) => a.title === title);
  if (!found) throw new Error(`attachment not found: ${title}`);
  return found.id;
}

test('P0-3核心: faststart MP4の全量DL前再生とseek', async ({ page, request }) => {
  const { attachments, recorder, frame } = await setup(page, request);
  const attId = byTitle(attachments, 'MG03-video-90MB-faststart.mp4');

  await clickProbeButton(frame, attId, 'original');
  const metadataLine = await waitLogLine(frame, /loadedmetadata/);
  const metadataResponses = recorder.snapshot();

  // 再生: 全量DL完了前に開始されること(buffered < duration が核心証拠)
  const playClickedAt = Date.now();
  await muteAndPlay(frame);
  const playingLine = await waitLogLine(frame, /playing:/);
  const statePlaying = await readMediaState(frame);
  expect(statePlaying.duration).toBeGreaterThan(250);
  expect(statePlaying.bufferedEnd).toBeLessThan(statePlaying.duration * 0.95);

  // 任意位置seek(未取得の90%地点)→ 再生継続と追加取得
  const seekAt = Date.now();
  await seekTo(frame, 0.9);
  const seekedLine = await waitLogLine(frame, /seeked:/);
  const stateAfterSeek = await readMediaState(frame);
  expect(stateAfterSeek.currentTime).toBeGreaterThan(stateAfterSeek.duration * 0.8);

  // 連続seek
  await (await lastSection(frame)).locator('button[data-action="media-seek"]').click();
  await frame.waitForTimeout(3000);

  // close相当(解放)
  await (await lastSection(frame)).locator('button[data-action="media-release"]').click();
  await waitLogLine(frame, /close相当/);

  const all = recorder.snapshot();
  const partials = all.filter((r) => r.status === 206);
  const seekPartials = recorder.countSince(seekAt, (r) => r.status === 206);
  const result = {
    test: 'faststart',
    metadataLine,
    playingLine,
    seekedLine,
    statePlaying,
    stateAfterSeek,
    responsesAtMetadata: metadataResponses,
    responsesAll: all,
    counts: {
      total: all.length,
      status206: partials.length,
      seekTriggered206: seekPartials,
    },
    playClickedAt,
  };
  const path = saveResult('p0-3-faststart', result);
  console.log(`result: ${path}`);
  console.log(
    `206=${partials.length}/${all.length}, seek後206=${seekPartials}, buffered@playing=${statePlaying.bufferedEnd.toFixed(1)}/${statePlaying.duration.toFixed(1)}s`,
  );
  // Rangeの成立(リリースゲート §7.6): 206が観測されること
  expect(partials.length).toBeGreaterThan(0);
});

test('P0-3比較: moov末尾MP4のmetadata取得挙動', async ({ page, request }) => {
  const { attachments, recorder, frame } = await setup(page, request);
  const attId = byTitle(attachments, 'MG03-video-90MB-moovend.mp4');

  await clickProbeButton(frame, attId, 'original');
  const metadataLine = await waitLogLine(frame, /loadedmetadata/, 120_000);
  const snapshot = recorder.snapshot();
  const path = saveResult('p0-3-moovend', { metadataLine, responses: snapshot });
  console.log(`result: ${path}`);
  console.log(`metadataまでの応答: ${snapshot.length}件(206=${snapshot.filter((r) => r.status === 206).length})`);
});

for (const title of ['MG03-audio.mp3', 'MG03-audio.wav', 'MG03-audio.m4a']) {
  test(`P0-3音声: ${title} 再生とseek`, async ({ page, request }) => {
    const { attachments, recorder, frame } = await setup(page, request);
    const attId = byTitle(attachments, title);

    await clickProbeButton(frame, attId, 'original');
    await waitLogLine(frame, /loadedmetadata/);
    await muteAndPlay(frame);
    await waitLogLine(frame, /playing:/);
    await seekTo(frame, 0.5);
    const seekedLine = await waitLogLine(frame, /seeked:/);
    const path = saveResult(`p0-3-${title.replace(/[^a-z0-9]/gi, '_')}`, {
      seekedLine,
      responses: recorder.snapshot(),
    });
    console.log(`result: ${path}(${seekedLine})`);
  });
}

for (const title of ['MG03-video.webm', 'MG03-audio.ogg']) {
  test(`P0-3再生可否: ${title}`, async ({ page, request }) => {
    const { attachments, frame } = await setup(page, request);
    const attId = byTitle(attachments, title);

    await clickProbeButton(frame, attId, 'original');
    await muteAndPlay(frame);
    const section = await lastSection(frame);
    const playingOrError = section
      .locator('li')
      .filter({ hasText: /playing:|error:/ })
      .first();
    await playingOrError.waitFor({ timeout: 60_000 });
    const text = (await playingOrError.textContent()) ?? '';
    console.log(`${title}: ${text}`);
    saveResult(`p0-3-${title.replace(/[^a-z0-9]/gi, '_')}`, { line: text });
  });
}
