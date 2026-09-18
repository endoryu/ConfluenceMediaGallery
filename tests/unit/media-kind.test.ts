import { describe, expect, it } from 'vitest';
import { mediaKindOf } from '../../src/shared/types/media';

describe('mediaKindOf', () => {
  it('image/video/audioを判別する', () => {
    expect(mediaKindOf('image/png')).toBe('image');
    expect(mediaKindOf('video/mp4')).toBe('video');
    expect(mediaKindOf('audio/mpeg')).toBe('audio');
  });

  it('それ以外はunsupported', () => {
    expect(mediaKindOf('application/pdf')).toBe('unsupported');
    expect(mediaKindOf('')).toBe('unsupported');
  });
});
