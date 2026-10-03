// EXPORTS: PlayerContextState, PlayerContext, usePlayer
import { createContext, useContext } from 'react';
import type { ISong, PlayMode } from '@/lib/music';

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
}

export const PlayerContext = createContext<PlayerContextState | null>(null);

export function usePlayer(): PlayerContextState {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
}
