// EXPORTS: SleepTimerState, SLEEP_OPTIONS, getSleepTimer, subscribeSleepTimer,
//          startSleepTimer, stopAfterTrack, cancelSleepTimer, remainingMs, formatRemaining
/**
 * Sleep timer store (in-memory, deliberately not persisted: a timer that
 * survives a restart would silently stop playback "out of nowhere").
 *
 * The countdown is anchored to an absolute timestamp instead of accumulating
 * setTimeout delays — WebView timers are throttled (or frozen) in the
 * background, so an accumulated timer drifts badly. A short tick compares
 * `Date.now()` against the target instead.
 */

export type SleepTimerState =
  | { kind: 'off' }
  | { kind: 'duration'; endsAt: number; minutes: number }
  | { kind: 'end-of-track' };

/** Preset durations in minutes shown in 设置 → 睡眠定时器. */
export const SLEEP_OPTIONS = [15, 30, 45, 60, 90] as const;

let state: SleepTimerState = { kind: 'off' };
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function getSleepTimer(): SleepTimerState {
  return state;
}

export function subscribeSleepTimer(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function startSleepTimer(minutes: number, now = Date.now()) {
  if (!Number.isFinite(minutes) || minutes <= 0) return;
  state = { kind: 'duration', endsAt: now + minutes * 60_000, minutes };
  emit();
}

/** Stop when the current track ends instead of after a fixed duration. */
export function stopAfterTrack() {
  state = { kind: 'end-of-track' };
  emit();
}

export function cancelSleepTimer() {
  if (state.kind === 'off') return;
  state = { kind: 'off' };
  emit();
}

/** Milliseconds left on a duration timer (0 when elapsed), null for other kinds. */
export function remainingMs(timer: SleepTimerState, now = Date.now()): number | null {
  return timer.kind === 'duration' ? Math.max(0, timer.endsAt - now) : null;
}

/** "MM:SS" countdown text (rounds up so it shows 15:00 right after starting). */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
