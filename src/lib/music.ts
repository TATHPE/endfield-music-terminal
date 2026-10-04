// EXPORTS: ISong, PlayMode, PLAY_MODES, SONG_STORE_NS, formatTime, formatClock, formatCodec, makeId
export interface ISong {
  id: string;
  title: string;
  artist: string;
  album: string;
  /** seconds, 0 = unknown */
  duration: number;
  /** display codec, e.g. "MP3" */
  codec: string;
  /** Hz, 0 = unknown */
  sampleRate: number;
  /** kbps, 0 = unknown */
  bitrate: number;
  fileName: string;
  /** embedded or fetched artwork; null when unavailable */
  cover: Blob | null;
  /** raw lyrics from embedded tag (LRC text or plain lines); undefined when none */
  lyrics?: string;
  /** user favorite flag, persisted with the song */
  favorited?: boolean;
  audio: Blob;
  addedAt: number;
}

export type PlayMode = 'sequence' | 'shuffle' | 'repeat-one';

export const PLAY_MODES: PlayMode[] = ['sequence', 'shuffle', 'repeat-one'];

export const SONG_STORE_NS = 'endfield-player';

/** mm:ss — used for inline readouts */
export function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** MM:SS — used for the big clock in now-playing view */
export function formatClock(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function formatCodec(raw: string): string {
  const upper = (raw || '').toUpperCase();
  if (upper.includes('MPEG 1 LAYER 3') || upper === 'MP3') return 'MP3';
  if (upper.includes('FLAC')) return 'FLAC';
  if (upper.includes('AAC') || upper.includes('MPEG-4') || upper.includes('M4A')) return 'M4A / AAC';
  if (upper.includes('VORBIS') || upper.includes('OGG')) return 'OGG';
  if (upper.includes('WAV') || upper.includes('PCM')) return 'WAV';
  if (upper.includes('OPUS')) return 'OPUS';
  if (upper.includes('APE')) return 'APE';
  if (upper.includes('WM')) return 'WMA';
  return upper.slice(0, 12) || 'AUDIO';
}

export function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
