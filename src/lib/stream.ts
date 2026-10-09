// EXPORTS: StreamUrlCheck, validateStreamUrl, streamTitleFromUrl, streamCodecFromUrl
import { formatCodec } from '@/lib/music';

export interface StreamUrlCheck {
  ok: boolean;
  /** normalized URL — only meaningful when ok */
  url: string;
  /** user-facing reason when not ok */
  reason: string;
}

/** Known audio container extensions (HLS/DASH playlists are handled separately). */
const AUDIO_EXT = /\.(mp3|flac|m4a|aac|ogg|oga|opus|wav|ape|wma|aiff?|mp4|webm)(?:[?#]|$)/i;
/** Playlists we deliberately reject: WebView's <audio> cannot play them natively. */
const PLAYLIST_EXT = /\.(m3u8|m3u|mpd)(?:[?#]|$)/i;

/**
 * Validate a user-pasted audio stream address.
 *
 * The player only ever *plays* a stream the user supplied — it does not search,
 * download, decrypt or proxy anything, so the only checks here are technical:
 * the scheme must be http(s) (some WebView kernels reject others) and HLS/DASH
 * playlists are refused up front, because they would fail silently later.
 */
export function validateStreamUrl(raw: string): StreamUrlCheck {
  const value = (raw || '').trim();
  if (!value) return { ok: false, url: '', reason: '请输入音频流地址' };

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, url: '', reason: '地址格式不正确（需要完整的 http:// 或 https:// 开头的地址）' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, url: '', reason: '只支持 http / https 音频流地址' };
  }
  if (PLAYLIST_EXT.test(parsed.pathname)) {
    return { ok: false, url: '', reason: '不支持 m3u8 / mpd 播放列表（HLS/DASH），请填单个音频文件直链' };
  }
  return { ok: true, url: parsed.toString(), reason: '' };
}

/** Display title derived from the URL (file name without extension). */
export function streamTitleFromUrl(url: string): string {
  try {
    const { pathname } = new URL(url);
    const last = pathname.split('/').filter(Boolean).pop() || '';
    const name = decodeURIComponent(last).replace(/\.[^.]+$/, '').trim();
    return name || '在线音频流';
  } catch {
    return '在线音频流';
  }
}

/** Codec label derived from the URL; unknown extensions show as STREAM. */
export function streamCodecFromUrl(url: string): string {
  try {
    const match = new URL(url).pathname.match(/\.([a-z0-9]+)(?:[?#]|$)/i);
    if (match) {
      const codec = formatCodec(match[1]);
      if (codec && codec !== 'AUDIO') return codec;
    }
  } catch {
    /* fall through */
  }
  return AUDIO_EXT.test(url) ? formatCodec(url) : 'STREAM';
}
