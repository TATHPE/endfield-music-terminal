import { describe, expect, it } from 'vitest';
import { evictionRange, mergeBuffered, shouldPauseAppend } from '@/lib/mse-window';

describe('mergeBuffered', () => {
  it('returns an empty list for empty input', () => {
    expect(mergeBuffered([])).toEqual([]);
  });

  it('keeps a single range unchanged', () => {
    expect(mergeBuffered([{ start: 1, end: 4 }])).toEqual([{ start: 1, end: 4 }]);
  });

  it('merges overlapping ranges', () => {
    expect(mergeBuffered([{ start: 0, end: 5 }, { start: 3, end: 9 }])).toEqual([
      { start: 0, end: 9 },
    ]);
  });

  it('merges a range fully contained in another', () => {
    expect(mergeBuffered([{ start: 0, end: 10 }, { start: 4, end: 6 }])).toEqual([
      { start: 0, end: 10 },
    ]);
  });

  it('merges exactly touching ranges', () => {
    expect(mergeBuffered([{ start: 0, end: 5 }, { start: 5, end: 8 }])).toEqual([
      { start: 0, end: 8 },
    ]);
  });

  it('merges ranges separated by less than the jitter epsilon', () => {
    expect(mergeBuffered([{ start: 0, end: 5 }, { start: 5.0005, end: 8 }])).toEqual([
      { start: 0, end: 8 },
    ]);
  });

  it('keeps genuinely disjoint ranges apart and sorts them', () => {
    expect(mergeBuffered([{ start: 30, end: 40 }, { start: 0, end: 5 }])).toEqual([
      { start: 0, end: 5 },
      { start: 30, end: 40 },
    ]);
  });

  it('merges a chain of three overlapping ranges into one', () => {
    expect(
      mergeBuffered([
        { start: 0, end: 4 },
        { start: 4, end: 9 },
        { start: 8, end: 12 },
      ]),
    ).toEqual([{ start: 0, end: 12 }]);
  });

  it('drops malformed entries instead of poisoning the window', () => {
    const result = mergeBuffered([
      { start: Number.NaN, end: 5 },
      { start: 1, end: Number.POSITIVE_INFINITY },
      { start: 3, end: 2 },
      { start: 0, end: 0 },
      { start: 7, end: 9 },
    ]);
    expect(result).toEqual([{ start: 7, end: 9 }]);
  });

  it('clamps negative starts to zero', () => {
    expect(mergeBuffered([{ start: -3, end: 2 }, { start: 1, end: 4 }])).toEqual([
      { start: 0, end: 4 },
    ]);
  });
});

describe('shouldPauseAppend', () => {
  it('returns false when nothing is buffered', () => {
    expect(shouldPauseAppend([], 10)).toBe(false);
  });

  it('returns false while the buffer ahead is below the threshold', () => {
    expect(shouldPauseAppend([{ start: 0, end: 25 }], 10, 20)).toBe(false);
  });

  it('returns true once the buffer ahead exceeds the threshold', () => {
    expect(shouldPauseAppend([{ start: 0, end: 35 }], 10, 20)).toBe(true);
  });

  it('does not pause when the threshold is met exactly', () => {
    expect(shouldPauseAppend([{ start: 0, end: 30 }], 10, 20)).toBe(false);
  });

  it('counts only the part beyond the current position', () => {
    // 0..50 with the playhead at 40 leaves 10s ahead — under a 20s threshold.
    expect(shouldPauseAppend([{ start: 0, end: 50 }], 40, 20)).toBe(false);
    expect(shouldPauseAppend([{ start: 0, end: 50 }], 5, 20)).toBe(true);
  });

  it('measures the contiguous run from the playhead, not the total buffered', () => {
    const ranges = [
      { start: 0, end: 4 },
      { start: 100, end: 160 },
    ];
    expect(shouldPauseAppend(ranges, 1, 20)).toBe(false);
  });

  it('returns false when the playhead sits inside a buffered range with < threshold left', () => {
    expect(shouldPauseAppend([{ start: 30, end: 45 }], 32, 20)).toBe(false);
  });

  it('returns true when the playhead sits before a buffered range that is far ahead', () => {
    expect(shouldPauseAppend([{ start: 30, end: 60 }], 30.5, 20)).toBe(true);
  });

  it('defaults to a 20s look-ahead window', () => {
    expect(shouldPauseAppend([{ start: 0, end: 19 }], 0)).toBe(false);
    expect(shouldPauseAppend([{ start: 0, end: 21 }], 0)).toBe(true);
  });

  it('never pauses for a non-finite playhead', () => {
    expect(shouldPauseAppend([{ start: 0, end: 100 }], Number.NaN)).toBe(false);
    expect(shouldPauseAppend([{ start: 0, end: 100 }], Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('evictionRange', () => {
  it('returns null when nothing is buffered', () => {
    expect(evictionRange([], 60)).toBeNull();
  });

  it('returns null when everything sits inside the kept tail', () => {
    expect(evictionRange([{ start: 55, end: 70 }], 60, 5)).toBeNull();
  });

  it('evicts exactly up to currentTime - keepBehindSec', () => {
    expect(evictionRange([{ start: 0, end: 80 }], 60, 5)).toEqual({ start: 0, end: 55 });
  });

  it('returns null when the cutoff lands exactly on a range start', () => {
    expect(evictionRange([{ start: 55, end: 80 }], 60, 5)).toBeNull();
  });

  it('returns null before the playhead has passed the keep-behind window', () => {
    expect(evictionRange([{ start: 0, end: 4 }], 4, 5)).toBeNull();
  });

  it('clamps negative currentTime to no eviction', () => {
    expect(evictionRange([{ start: 0, end: 30 }], -12, 5)).toBeNull();
  });

  it('evicts only the buffered part below the cutoff, leaving the kept part alone', () => {
    // Playhead 50 with keepBehind 5 → cutoff 45: the buffer at 45..60 is kept
    // (touching the cutoff, not crossing it), so only the first span goes.
    const ranges = [
      { start: 0, end: 10 },
      { start: 45, end: 60 },
    ];
    expect(evictionRange(ranges, 50, 5)).toEqual({ start: 0, end: 10 });
  });

  it('clips a buffered span that crosses the cutoff', () => {
    const ranges = [
      { start: 0, end: 10 },
      { start: 40, end: 60 },
    ];
    expect(evictionRange(ranges, 50, 5)).toEqual({ start: 0, end: 45 });
  });

  it('spans a contiguous region that crosses the cutoff', () => {
    const ranges = [
      { start: 0, end: 20 },
      { start: 20, end: 45 },
      { start: 45, end: 90 },
    ];
    expect(evictionRange(ranges, 70, 5)).toEqual({ start: 0, end: 65 });
  });

  it('keeps the result inside the buffered interval, never past the cutoff', () => {
    const result = evictionRange([{ start: 0, end: 12 }], 20, 5);
    expect(result).toEqual({ start: 0, end: 12 });
    expect(result!.end).toBeLessThanOrEqual(20 - 5);
  });

  it('always returns start >= 0 and start < end when it returns a range', () => {
    const samples: Array<[{ start: number; end: number }[], number, number]> = [
      [[{ start: 0, end: 100 }], 50, 5],
      [[{ start: -4, end: 30 }], 20, 5],
      [[{ start: 0, end: 3 }, { start: 10, end: 40 }], 25, 5],
    ];
    for (const [ranges, current, keep] of samples) {
      const result = evictionRange(ranges, current, keep);
      expect(result).not.toBeNull();
      expect(result!.start).toBeGreaterThanOrEqual(0);
      expect(result!.start).toBeLessThan(result!.end);
    }
  });

  it('respects a custom keep-behind window', () => {
    expect(evictionRange([{ start: 0, end: 100 }], 60, 30)).toEqual({ start: 0, end: 30 });
    expect(evictionRange([{ start: 0, end: 100 }], 60, 60)).toBeNull();
  });

  it('handles unsorted ranges', () => {
    expect(
      evictionRange(
        [
          { start: 60, end: 80 },
          { start: 0, end: 20 },
        ],
        50,
        5,
      ),
    ).toEqual({ start: 0, end: 20 });
  });
});
