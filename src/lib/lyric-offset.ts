// EXPORTS: GLOBAL_OFFSET_KEY, songOffsetKey, getGlobalOffset, setGlobalOffset,
//          getSongOffset, setSongOffset, getEffectiveOffset
/**
 * Lyric sync offsets.
 *
 * A song may carry its own offset (`…:lyric-offset:<songId>`); the global value
 * stays as the default for tracks that were never adjusted. Values are seconds
 * (positive = lyrics appear later).
 */

export const GLOBAL_OFFSET_KEY = 'endfield-player:lyric-offset';

export function songOffsetKey(songId: string): string {
  return `${GLOBAL_OFFSET_KEY}:${songId}`;
}

function readOffset(key: string): number | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function writeOffset(key: string, seconds: number) {
  try {
    localStorage.setItem(key, String(Math.round(seconds * 10) / 10));
  } catch {
    /* storage unavailable */
  }
}

/** Default offset applied to tracks without their own value. */
export function getGlobalOffset(): number {
  return readOffset(GLOBAL_OFFSET_KEY) ?? 0;
}

export function setGlobalOffset(seconds: number) {
  writeOffset(GLOBAL_OFFSET_KEY, seconds);
}

/** Per-track offset, or null when this track was never adjusted. */
export function getSongOffset(songId: string): number | null {
  return readOffset(songOffsetKey(songId));
}

export function setSongOffset(songId: string, seconds: number) {
  writeOffset(songOffsetKey(songId), seconds);
}

/** Per-track value when present, otherwise the global default. */
export function getEffectiveOffset(songId: string | null | undefined): number {
  if (!songId) return getGlobalOffset();
  return getSongOffset(songId) ?? getGlobalOffset();
}
