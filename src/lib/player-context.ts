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

  /** terminal import/scan log stream (most recent first) for the media node */
  scanLogs: string[];
  /** live 24-bucket spectrum readout from the playing source (0..255) */
  spectrum: number[];
  spectrumOn: boolean;
  setSpectrumOn: (v: boolean) => void;
  /** assign base-archive tags (战场记录 / 通讯日志 / BGM / 环境音) to a song */
  setSongTags: (id: string, tags: string[]) => void;
  /** persist the current queue as a QUEUE SNAPSHOT playlist */
  saveQueueSnapshot: () => void;

  importFiles: (files: FileList | File[]) => Promise<void>;
  /** scan the device MediaStore for audio and import new songs (native only);
   *  offline sidecar lyrics are read in the background, online matching is
   *  deferred to the lyrics panel where the user explicitly opts in */
  scanDeviceSongs: () => Promise<{
    added: number;
    skipped: number;
    failed: number;
    /** true when the failure was a permission denial (vs a scan error). */
    permissionDenied: boolean;
    /** underlying error detail for scan failures ('' when none). */
    error?: string;
  }>;
  /** user-triggered online lyric match from the lyrics panel (native pool) */
  fetchLyricsOnline: (songId: string) => Promise<void>;
  /** attach lyric text from a user-picked .lrc/.txt file to a song */
  importLyrics: (songId: string, content: string) => Promise<void>;
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
