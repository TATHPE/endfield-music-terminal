import { describe, expect, it } from 'vitest';
import {
  formatRemaining,
  remainingMs,
  type SleepTimerState,
} from '@/lib/sleep-timer';

describe('sleep timer', () => {
  it('counts down against the absolute deadline', () => {
    const timer: SleepTimerState = { kind: 'duration', endsAt: 1_000_000, minutes: 15 };
    expect(remainingMs(timer, 1_000_000 - 90_000)).toBe(90_000);
    expect(remainingMs(timer, 1_000_000)).toBe(0);
    // Timers fire late in a throttled WebView: never negative.
    expect(remainingMs(timer, 1_000_001)).toBe(0);
  });

  it('has no remaining time for the other states', () => {
    expect(remainingMs({ kind: 'off' })).toBeNull();
    expect(remainingMs({ kind: 'end-of-track' })).toBeNull();
  });

  it('formats MM:SS with ceil (shows 15:00 right after starting)', () => {
    expect(formatRemaining(900_000)).toBe('15:00');
    expect(formatRemaining(899_999)).toBe('15:00');
    expect(formatRemaining(65_000)).toBe('01:05');
    expect(formatRemaining(0)).toBe('00:00');
  });
});
