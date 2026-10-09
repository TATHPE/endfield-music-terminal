import { describe, expect, it } from 'vitest';
import { streamCodecFromUrl, streamTitleFromUrl, validateStreamUrl } from '@/lib/stream';

describe('validateStreamUrl', () => {
  it('accepts http and https audio urls', () => {
    expect(validateStreamUrl('https://example.org/a/b/track.mp3').ok).toBe(true);
    expect(validateStreamUrl('http://example.org/stream').ok).toBe(true);
  });

  it('trims surrounding whitespace', () => {
    const r = validateStreamUrl('  https://example.org/t.mp3  ');
    expect(r.ok).toBe(true);
    expect(r.url).toBe('https://example.org/t.mp3');
  });

  it('rejects empty input', () => {
    expect(validateStreamUrl('').ok).toBe(false);
    expect(validateStreamUrl('   ').ok).toBe(false);
  });

  it('rejects malformed addresses', () => {
    const r = validateStreamUrl('not a url');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('格式');
  });

  it('rejects non-http(s) schemes', () => {
    expect(validateStreamUrl('ftp://example.org/a.mp3').ok).toBe(false);
    expect(validateStreamUrl('file:///sdcard/a.mp3').ok).toBe(false);
  });

  it('rejects HLS/DASH playlists with a clear reason', () => {
    const r = validateStreamUrl('https://example.org/live/stream.m3u8');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('m3u8');
    expect(validateStreamUrl('https://example.org/manifest.mpd').ok).toBe(false);
  });

  it('accepts extension-less stream endpoints', () => {
    expect(validateStreamUrl('https://example.org/radio/stream?id=42').ok).toBe(true);
  });
});

describe('streamTitleFromUrl', () => {
  it('uses the file name without extension', () => {
    expect(streamTitleFromUrl('https://example.org/music/Bagatelle-No1.mp3')).toBe('Bagatelle-No1');
  });

  it('decodes percent-encoded names', () => {
    expect(streamTitleFromUrl('https://example.org/%E6%99%B4%E5%A4%A9.flac')).toBe('晴天');
  });

  it('falls back when the path carries no name', () => {
    expect(streamTitleFromUrl('https://example.org/')).toBe('在线音频流');
    expect(streamTitleFromUrl('nonsense')).toBe('在线音频流');
  });
});

describe('streamCodecFromUrl', () => {
  it('maps known extensions', () => {
    expect(streamCodecFromUrl('https://example.org/a.mp3')).toBe('MP3');
    expect(streamCodecFromUrl('https://example.org/a.flac')).toBe('FLAC');
    expect(streamCodecFromUrl('https://example.org/a.m4a')).toBe('M4A / AAC');
    expect(streamCodecFromUrl('https://example.org/a.opus')).toBe('OPUS');
  });

  it('reads the extension in front of a query string', () => {
    expect(streamCodecFromUrl('https://example.org/a.mp3?token=abc')).toBe('MP3');
  });

  it('falls back to STREAM for unknown shapes', () => {
    expect(streamCodecFromUrl('https://example.org/stream?id=1')).toBe('STREAM');
  });
});
