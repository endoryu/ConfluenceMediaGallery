#!/usr/bin/env node
/**
 * E2E認証セットアップ(ガイド §7.1、L3 §6.3)。
 * headed browserを開き、ユーザー自身がログイン(password/MFAはユーザー保持)。
 * 完了後にPlaywright storageStateを local/ へ保存する(commit禁止 — CLAUDE.md §10)。
 * 本scriptは資格情報を一切読み取らない。
 */
import { mkdirSync } from 'node:fs';
import readline from 'node:readline/promises';
import process from 'node:process';
import { chromium } from '@playwright/test';

const SITE = process.env.MG_SITE ?? 'https://ryu-dev.atlassian.net';
const STATE_PATH = 'local/storageState.json';

mkdirSync('local', { recursive: true });
const browser = await chromium.launch({ headless: false, channel: 'chrome' });
const context = await browser.newContext();
const page = await context.newPage();
await page.goto(`${SITE}/wiki`);

process.stdout.write(
  [
    '',
    '=== E2E認証セットアップ ===',
    `1. 開いたChromeウィンドウで ${SITE} にログインしてください(MFA含む)`,
    '2. Confluenceのホームが表示されたら、このウィンドウに戻ってEnterを押してください',
    '',
  ].join('\n'),
);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
await rl.question('ログイン完了後にEnter > ');
rl.close();

await context.storageState({ path: STATE_PATH });
await browser.close();
process.stdout.write(`保存しました: ${STATE_PATH}(local/はgit管理外)\n`);
