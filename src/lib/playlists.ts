// EXPORTS: Playlist, FAVORITES_ID, makePlaylistId
import { makeId } from '@/lib/music';

/** A user-created playlist backed by IndexedDB. */
export interface Playlist {
  id: string;
  name: string;
  /** ordered song ids */
  songIds: string[];
  createdAt: number;
}

/** Reserved playlist id used by the built-in "收藏" list. */
export const FAVORITES_ID = 'favorites';

export function makePlaylistId(): string {
  return `pl-${makeId()}`;
}

/** Normalize a raw playlist name, falling back to a terminal-style default. */
export function normalizePlaylistName(name: string): string {
  const trimmed = name.trim().slice(0, 32);
  return trimmed || '未命名清单';
}
