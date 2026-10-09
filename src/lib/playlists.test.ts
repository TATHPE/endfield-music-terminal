import { describe, expect, it } from 'vitest';
import { FAVORITES_ID, makePlaylistId, normalizePlaylistName } from '@/lib/playlists';

describe('normalizePlaylistName', () => {
  it('trims whitespace', () => {
    expect(normalizePlaylistName('  夜间电台  ')).toBe('夜间电台');
  });

  it('falls back to a default name when empty', () => {
    expect(normalizePlaylistName('')).toBe('未命名清单');
    expect(normalizePlaylistName('   ')).toBe('未命名清单');
  });

  it('truncates to 32 characters', () => {
    const long = 'x'.repeat(80);
    expect(normalizePlaylistName(long)).toHaveLength(32);
  });
});

describe('ids', () => {
  it('keeps the reserved favorites id stable', () => {
    expect(FAVORITES_ID).toBe('favorites');
  });

  it('generates unique playlist ids', () => {
    const ids = new Set(Array.from({ length: 200 }, () => makePlaylistId()));
    expect(ids.size).toBe(200);
  });
});
