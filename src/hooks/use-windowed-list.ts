// EXPORTS: useWindowedList, WINDOWING_THRESHOLD
import { useCallback, useLayoutEffect, useState, type RefObject } from 'react';

/**
 * Lists longer than this many rows render a window instead of every row.
 * Below the threshold the normal (animated) list is kept, so everyday libraries
 * look exactly like before.
 */
export const WINDOWING_THRESHOLD = 120;

/** Extra rows rendered above and below the viewport. */
const OVERSCAN = 6;

/** Row spacing of the list container (`gap-1`). */
const ROW_GAP_PX = 4;

/** Fallback row pitch (row + gap) used before the first row is measured. */
const DEFAULT_PITCH = 64;

export interface WindowedList {
  /** true when the list is long enough to be windowed */
  active: boolean;
  /** inclusive start index of the rendered slice */
  start: number;
  /** exclusive end index of the rendered slice */
  end: number;
  /** spacer height (px) that stands in for the rows above the window */
  topPad: number;
  /** spacer height (px) that stands in for the rows below the window */
  bottomPad: number;
  /** attach to the first rendered row so its height can be measured */
  measureRow: (el: HTMLElement | null) => void;
}

/** Nearest ancestor that scrolls vertically (the page shell, not the window). */
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY)) return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * Windowed rendering for long lists. The caller owns the list element ref and
 * passes it in, so the returned object holds plain values only (the hooks lint
 * rules reject reading ref-bearing objects during render).
 */
export function useWindowedList(
  itemCount: number,
  listRef: RefObject<HTMLUListElement | null>,
  threshold = WINDOWING_THRESHOLD,
): WindowedList {
  /** row pitch in px (row height + gap) — state, so render never reads a ref */
  const [pitch, setPitch] = useState(DEFAULT_PITCH);
  const [range, setRange] = useState({ start: 0, end: threshold });

  /** Ref callback: measuring updates state, so no ref is read during render. */
  const measureRow = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const height = el.offsetHeight;
    if (height <= 16) return;
    const next = height + ROW_GAP_PX;
    setPitch((prev) => (Math.abs(prev - next) < 0.5 ? prev : next));
  }, []);

  const active = itemCount > threshold;

  const update = useCallback(() => {
    const list = listRef.current;
    if (!list || !active) return;
    const scroller = findScrollParent(list);
    const viewHeight = scroller?.clientHeight || window.innerHeight;
    const listTop = list.getBoundingClientRect().top;
    const viewTop = scroller ? scroller.getBoundingClientRect().top : 0;
    // How far the first row already scrolled above the viewport.
    const scrolled = Math.max(0, viewTop - listTop);
    const first = Math.max(0, Math.floor(scrolled / pitch) - OVERSCAN);
    const visible = Math.ceil(viewHeight / pitch) + OVERSCAN * 2;
    const end = Math.min(itemCount, first + visible);
    setRange((prev) => (prev.start === first && prev.end === end ? prev : { start: first, end }));
  }, [active, itemCount, listRef, pitch]);

  useLayoutEffect(() => {
    if (!active) return;
    const list = listRef.current;
    const scroller = findScrollParent(list);
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    // The first pass waits for the next frame: no state update inside the effect.
    frame = requestAnimationFrame(update);
    const target: HTMLElement | Window = scroller ?? window;
    target.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      target.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [active, listRef, update]);

  const start = active ? range.start : 0;
  const end = active ? Math.min(range.end, itemCount) : itemCount;

  return {
    active,
    start,
    end,
    topPad: active ? start * pitch : 0,
    bottomPad: active ? Math.max(0, (itemCount - end) * pitch) : 0,
    measureRow,
  };
}
