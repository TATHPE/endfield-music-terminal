// EXPORTS: PlayerContextState, PlayerContext, usePlayer
import { createContext, useContext } from 'react';
import type { ISong, PlayMode } from '@/lib/music';
import type { Playlist } from '@/lib/playlists';

export interface PlayerContextState {
  songs: ISong[];
  currentId: string | null;
  currentSong: ISong | null;
  isPlaying: boolean;
  mode: PlayMode;
  volume: number;
  muted: boolean;
  currentTime: number;
  duration: number;

  /** active queue context: playlist id, or null for the whole library */
  activeQueueId: string | null;
  /** resolved queue for the active context (playlist songs or all songs) */
  queue: ISong[];
  /** all user playlists, sorted by createdAt */
  playlists: Playlist[];

  importFiles: (files: FileList | File[]) => Promise<void>;
  removeSong: (id: string) => void;
  playSong: (id: string) => void;
  togglePlay: () => void;
  playNext: () => void;
  playPrev: () => void;
  seek: (t: number) => void;
  cycleMode: () => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;

  /** favorite (收藏) toggle — writes through to IndexedDB */
  toggleFavorite: (id: string) => void;

  createPlaylist: (name: string) => string;
  renamePlaylist: (id: string, name: string) => void;
  deletePlaylist: (id: string) => void;
  addToPlaylist: (playlistId: string, songId: string) => void;
  removeFromPlaylist: (playlistId: string, songId: string) => void;
  /** start playing from a playlist; when empty, plays the first song inside it */
  playPlaylist: (id: string | null) => void;
  /** jump the queue context without changing playback */
  setActiveQueue: (id: string | null) => void;
  /** remove a song from the active queue (library mode removes the song entirely) */
  removeFromQueue: (id: string) => void;
}

export const PlayerContext = createContext<PlayerContextState | null>(null);

export function usePlayer(): PlayerContextState {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
}
