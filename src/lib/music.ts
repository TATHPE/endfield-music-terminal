// EXPORTS: ISong, PlayMode, PLAY_MODES, SONG_STORE_NS, formatTime, formatClock, formatCodec,
//          shouldUpdateDuration, isLiveStream, makeId
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
  /** in-app asset URL for preset (bundled) tracks; plays directly, no blob needed */
  presetUrl?: string;
  /** user-supplied http(s) audio stream; played directly by <audio>, never proxied or cached */
  streamUrl?: string;
  /** absolute device path for scanned songs; played via _capacitor_file_ bridge */
  devicePath?: string;
  /** MediaStore album id for lazily loading album art on device songs */
  deviceAlbumId?: number;
  /** base-archive tags: 战场记录 / 通讯日志 / BGM / 环境音 */
  tags?: string[];
  /** MD5 of the audio blob, computed once at import; '' when unknown */
  hash?: string;
  audio: Blob | null;
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

/**
 * Decide whether a duration measured by the media element should overwrite the
 * stored one. Online streams start out unknown (0); label-derived values are
 * trusted unless they are clearly off, so we never fight good metadata.
 */
export function shouldUpdateDuration(stored: number, measured: number): boolean {
  if (!Number.isFinite(measured) || measured <= 0) return false;
  if (!Number.isFinite(stored) || stored <= 0) return true;
  return Math.abs(stored - measured) > 2;
}

/**
 * 直播流判定：用户提供的在线流若没有已知时长（duration 为 0；直播流的
 * duration 是 Infinity，被 shouldUpdateDuration 忽略），就按直播流呈现——
 * 界面显示已播时长 + LIVE，而不是 0:00 / 0:00。
 */
export function isLiveStream(song: { streamUrl?: string; duration: number } | null | undefined): boolean {
  if (!song?.streamUrl) return false;
  return !Number.isFinite(song.duration) || song.duration <= 0;
}

export function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
