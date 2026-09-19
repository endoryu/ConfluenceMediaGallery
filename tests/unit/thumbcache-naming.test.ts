import { describe, expect, it } from 'vitest';
import {
  THUMBCACHE_CONFIG_NAME,
  assertThumbcacheWriteTarget,
  buildThumbcacheName,
  isThumbcacheConfigTitle,
  isThumbcacheTitle,
  parseThumbcacheName,
} from '../../src/gallery/thumbcache/naming';

describe('parseThumbcacheName', () => {
  it('正しい命名を解析する', () => {
    expect(parseThumbcacheName('mg_thumbcache_123456_v5_w320')).toEqual({
      targetAttachmentId: '123456',
      targetVersion: 5,
      width: 320,
    });
  });

  it('規則外はnull(全分岐)', () => {
    for (const bad of [
      'mg_thumbcache_config', // configは別扱い
      'mg_thumbcache_123_v5_w320.png', // 拡張子付き
      'mg_thumbcache_123_v5', // width欠落
      'mg_thumbcache_123_w320', // version欠落
      'mg_thumbcache_abc_v5_w320', // 非数値id
      'mg_thumbcache_123_vx_w320', // 非数値version
      'MG_THUMBCACHE_123_v5_w320', // 大文字
      'photo.png',
      'xmg_thumbcache_123_v5_w320', // 前置文字
      'mg_thumbcache_123_v5_w320_extra', // 後置
    ]) {
      expect(parseThumbcacheName(bad), bad).toBeNull();
    }
  });
});

describe('buildThumbcacheName', () => {
  it('parseと往復一致する', () => {
    const name = buildThumbcacheName('42', 3, 640);
    expect(name).toBe('mg_thumbcache_42_v3_w640');
    expect(parseThumbcacheName(name)).toEqual({
      targetAttachmentId: '42',
      targetVersion: 3,
      width: 640,
    });
  });
});

describe('prefix判定', () => {
  it('thumb・configともprefix一致、configは専用判定', () => {
    expect(isThumbcacheTitle('mg_thumbcache_1_v1_w320')).toBe(true);
    expect(isThumbcacheTitle(THUMBCACHE_CONFIG_NAME)).toBe(true);
    expect(isThumbcacheTitle('photo.png')).toBe(false);
    expect(isThumbcacheConfigTitle(THUMBCACHE_CONFIG_NAME)).toBe(true);
    expect(isThumbcacheConfigTitle('mg_thumbcache_1_v1_w320')).toBe(false);
  });
});

describe('assertThumbcacheWriteTarget(命名ガードの負例 — Phase1_Spec §5.3)', () => {
  it('規則内は通す', () => {
    expect(() => assertThumbcacheWriteTarget('mg_thumbcache_1_v1_w320')).not.toThrow();
    expect(() => assertThumbcacheWriteTarget(THUMBCACHE_CONFIG_NAME)).not.toThrow();
  });

  it('ユーザーコンテンツ相当のファイル名はthrowする', () => {
    for (const bad of [
      'photo.png',
      'mg_thumbcache_1_v1_w320.jpg',
      'mg_thumbcache_config.json',
      'mg_thumbcache_',
      '',
    ]) {
      expect(() => assertThumbcacheWriteTarget(bad), bad).toThrow(/命名規則外/);
    }
  });
});
