import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getEffectiveOffset,
  getGlobalOffset,
  getSongOffset,
  setGlobalOffset,
  setSongOffset,
  songOffsetKey,
} from '@/lib/lyric-offset';

function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, String(value)),
  } as Storage;
}

beforeEach(() => {
  vi.stubGlobal('localStorage', makeStorage());
});

describe('lyric offsets', () => {
  it('defaults to 0 and stores the global value', () => {
    expect(getGlobalOffset()).toBe(0);
    setGlobalOffset(0.5);
    expect(getGlobalOffset()).toBe(0.5);
  });

  it('keys per-song offsets separately and rounds to 0.1s', () => {
    expect(songOffsetKey('s1')).toBe('endfield-player:lyric-offset:s1');
    setSongOffset('s1', 0.34);
    expect(localStorage.getItem(songOffsetKey('s1'))).toBe('0.3');
    expect(getSongOffset('s1')).toBe(0.3);
    expect(getSongOffset('s2')).toBeNull();
  });

  it('prefers the per-song value, falling back to the global one', () => {
    setGlobalOffset(-0.5);
    expect(getEffectiveOffset('s1')).toBe(-0.5);
    setSongOffset('s1', 1.2);
    expect(getEffectiveOffset('s1')).toBe(1.2);
    expect(getEffectiveOffset(null)).toBe(-0.5);
  });
});
