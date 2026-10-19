import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
  registerPlugin: () => ({}),
}));
vi.mock('@capacitor/status-bar', () => ({
  StatusBar: { setStyle: () => undefined, setBackgroundColor: () => undefined },
  Style: { Dark: 'DARK', Light: 'LIGHT' },
}));

import { getBgMode, resolveBgModeValue } from '@/lib/theme';

function makeStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map<string, string>(Object.entries(initial));
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

describe('background mode', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeStorage());
  });

  it('resolves system to the OS preference and keeps explicit modes', () => {
    expect(resolveBgModeValue('dark', true)).toBe('dark');
    expect(resolveBgModeValue('dark', false)).toBe('dark');
    expect(resolveBgModeValue('light', true)).toBe('light');
    expect(resolveBgModeValue('system', true)).toBe('dark');
    expect(resolveBgModeValue('system', false)).toBe('light');
  });

  it('reads the stored mode, defaulting to dark for missing/garbage values', () => {
    expect(getBgMode()).toBe('dark');
    localStorage.setItem('endfield-player:bgmode', 'light');
    expect(getBgMode()).toBe('light');
    localStorage.setItem('endfield-player:bgmode', 'system');
    expect(getBgMode()).toBe('system');
    localStorage.setItem('endfield-player:bgmode', 'nonsense');
    expect(getBgMode()).toBe('dark');
  });
});
