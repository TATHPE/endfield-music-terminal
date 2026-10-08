import { Capacitor, registerPlugin } from '@capacitor/core';

export interface DeviceSong {
  id: number;
  title: string;
  artist: string;
  album: string;
  albumId: number;
  duration: number;
  path: string;
  size: number;
  mime: string;
}

export interface LyricResult {
  source: 'file' | 'net' | null;
  lyrics: string | null;
}

export interface MediaScannerPlugin {
  /** Scan MediaStore for audio files (requests audio permission on demand). */
  scanAudio(): Promise<{ songs: DeviceSong[] }>;
  /** Read the same-directory sidecar .lrc/.txt only — never touches the network. */
  getLyricsLocal(options: { path: string }): Promise<LyricResult>;
  /** User-triggered online lyric match (NetEase → QQ fallback), runs off the UI thread. */
  getLyricsOnline(options: { title: string; artist?: string }): Promise<LyricResult>;
  /** Album art as base64 (JPEG/PNG) for an album id; null when unavailable.
   *  The online iTunes fallback runs on a native background thread pool. */
  getAlbumArt(options: { albumId: number; path?: string; title?: string; artist?: string }): Promise<{ base64: string | null }>;
  /** Read a device audio file as base64 (tooLarge=true when above the cap). */
  getAudioData(options: { path: string }): Promise<{ base64?: string; mime?: string; tooLarge?: boolean }>;
  /** Open the system app-details settings page (manual permission grant). */
  openSettings(): Promise<void>;
}

export const MediaScanner = registerPlugin<MediaScannerPlugin>('MediaScanner');

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Build the in-app URL a WebView can actually stream a device file from.
 * Capacitor's official convertFileSrc maps `capacitor://localhost/_capacitor_file_`
 * onto the real filesystem (handles encoding + ROM/WebView differences), so
 * <audio> can play any absolute path directly.
 */
export function deviceUrl(path: string): string {
  return Capacitor.convertFileSrc(path);
}

// Album-art cache (albumId|path -> base64 data URL), so the same album is fetched once.
const artCache = new Map<string, Promise<string | null>>();

export function albumArtUrl(albumId: number, path?: string, title?: string, artist?: string): Promise<string | null> {
  const key = albumId > 0 ? `a:${albumId}` : `p:${path || ''}`;
  let p = artCache.get(key);
  if (!p) {
    p = MediaScanner.getAlbumArt({ albumId: albumId > 0 ? albumId : 0, path: path || '', title: title || '', artist: artist || '' })
      .then((r) => (r.base64 ? `data:image/jpeg;base64,${r.base64}` : null))
      .catch(() => null);
    artCache.set(key, p);
  }
  return p;
}

// Device-audio cache: device path -> object URL. Each file is read once through
// the native bridge and played as a Blob, which makes <audio> fully seekable
// (asset-loader streams aren't reliably Range-capable on ColorOS, causing
// lock-screen scrubbers to snap back). Oversized files fall back to deviceUrl().
const audioCache = new Map<string, Promise<string>>();

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function loadDeviceAudio(path: string): Promise<string> {
  let p = audioCache.get(path);
  if (!p) {
    p = MediaScanner.getAudioData({ path })
      .then((r) => {
        if (!r.base64 || !r.mime || r.tooLarge) return deviceUrl(path);
        const blob = new Blob([base64ToBytes(r.base64)], { type: r.mime });
        return URL.createObjectURL(blob);
      })
      .catch(() => deviceUrl(path));
    audioCache.set(path, p);
  }
  return p;
}
