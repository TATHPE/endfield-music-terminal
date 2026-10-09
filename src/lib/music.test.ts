import { describe, expect, it } from 'vitest';
import { PLAY_MODES, formatClock, formatCodec, formatTime, makeId } from '@/lib/music';

describe('formatTime (inline readouts)', () => {
  it('formats as m:ss', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(65.9)).toBe('1:05');
    expect(formatTime(600)).toBe('10:00');
  });

  it('falls back for unknown values', () => {
    expect(formatTime(-1)).toBe('0:00');
    expect(formatTime(Number.NaN)).toBe('0:00');
    expect(formatTime(Number.POSITIVE_INFINITY)).toBe('0:00');
  });
});

describe('formatClock (now-playing clock)', () => {
  it('formats as MM:SS and keeps a placeholder for empty tracks', () => {
    expect(formatClock(65)).toBe('01:05');
    expect(formatClock(0)).toBe('--:--');
    expect(formatClock(-3)).toBe('--:--');
  });
});

describe('formatCodec', () => {
  it('normalizes the codec names music-metadata returns', () => {
    expect(formatCodec('MPEG 1 Layer 3')).toBe('MP3');
    expect(formatCodec('mp3')).toBe('MP3');
    expect(formatCodec('flac')).toBe('FLAC');
    expect(formatCodec('MPEG-4/AAC')).toBe('M4A / AAC');
    expect(formatCodec('Vorbis I')).toBe('OGG');
    expect(formatCodec('PCM')).toBe('WAV');
    expect(formatCodec('opus')).toBe('OPUS');
  });

  it('falls back to an upper-cased, truncated label', () => {
    expect(formatCodec('')).toBe('AUDIO');
    expect(formatCodec('some-unknown-codec')).toBe('SOME-UNKNOWN');
  });
});

describe('misc', () => {
  it('exposes the three playback modes', () => {
    expect(PLAY_MODES).toEqual(['sequence', 'shuffle', 'repeat-one']);
  });

  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 200 }, () => makeId()));
    expect(ids.size).toBe(200);
  });
});
