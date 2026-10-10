// EXPORTS: BufferedRange, mergeBuffered, shouldPauseAppend, evictionRange
//
// Pure math for a live MSE (MediaSource) sliding window.
//
// A live radio stream never ends, so the amount of data appended to a
// SourceBuffer must be bounded: the player keeps a short window ahead of the
// playhead and drops everything far behind it. All of that bookkeeping is
// plain number crunching with no DOM access, so it lives here and is unit
// tested instead of being buried inside the streaming class.

export type BufferedRange = { start: number; end: number };

/** Tolerated gap when deciding whether two ranges touch (timeupdate jitter). */
const ADJACENT_EPSILON = 1e-3;

/**
 * Merge overlapping / touching ranges into a sorted, disjoint list.
 * Invalid entries (NaN, Infinity, negative or inverted spans) are dropped:
 * one bad `buffered` reading must not poison the whole window calculation.
 */
export function mergeBuffered(ranges: BufferedRange[]): BufferedRange[] {
  const clean: BufferedRange[] = [];
  for (const range of ranges || []) {
    if (!range) continue;
    const start = Number(range.start);
    const end = Number(range.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const s = Math.max(0, start);
    if (end <= s) continue;
    clean.push({ start: s, end });
  }
  clean.sort((a, b) => a.start - b.start);

  const merged: BufferedRange[] = [];
  for (const range of clean) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end + ADJACENT_EPSILON) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ start: range.start, end: range.end });
    }
  }
  return merged;
}

/**
 * Total buffered audio *after* `currentTime`, i.e. how far ahead of the
 * playhead the appended data already reaches. Gaps are honoured: only the
 * contiguous run starting at (or covering) the playhead counts, because data
 * behind a hole cannot be played without stalling first.
 */
function bufferedAheadOf(ranges: BufferedRange[], currentTime: number): number {
  for (const range of ranges) {
    if (range.end <= currentTime) continue;
    if (range.start > currentTime + ADJACENT_EPSILON) break;
    const start = Math.max(range.start, currentTime);
    let end = range.end;
    // Walk forward across touching neighbours (already merged, but keep the
    // loop defensive so a hand-built input behaves the same).
    for (const next of ranges) {
      if (next.start <= end + ADJACENT_EPSILON && next.end > end) end = next.end;
    }
    return Math.max(0, end - start);
  }
  return 0;
}

/**
 * True when the buffer already reaches more than `aheadSec` past the
 * playhead, so appending more network data is pointless (and only grows
 * memory). A non-finite playhead / threshold never asks for a pause.
 */
export function shouldPauseAppend(
  ranges: BufferedRange[],
  currentTime: number,
  aheadSec = 20,
): boolean {
  if (!Number.isFinite(currentTime) || !Number.isFinite(aheadSec)) return false;
  return bufferedAheadOf(mergeBuffered(ranges), currentTime) > Math.max(0, aheadSec);
}

/**
 * The slice that should be handed to `SourceBuffer.remove()`: everything in
 * `[0, currentTime - keepBehindSec)` that is actually buffered.
 *
 * Returns null when there is nothing to drop. Otherwise the result always
 * satisfies `start >= 0` and `start < end`.
 */
export function evictionRange(
  ranges: BufferedRange[],
  currentTime: number,
  keepBehindSec = 5,
): BufferedRange | null {
  if (!Number.isFinite(currentTime) || !Number.isFinite(keepBehindSec)) return null;
  const cutoff = currentTime - Math.max(0, keepBehindSec);
  if (!(cutoff > 0)) return null;

  let start = Infinity;
  let end = -Infinity;
  for (const range of mergeBuffered(ranges)) {
    if (range.start >= cutoff) continue;
    start = Math.min(start, range.start);
    end = Math.max(end, Math.min(range.end, cutoff));
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const from = Math.max(0, start);
  if (!(from < end)) return null;
  return { start: from, end };
}
