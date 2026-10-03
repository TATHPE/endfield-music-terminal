// EXPORTS: ParsedMeta, parseAudioFile, fetchItunesCover
import { parseBlob } from 'music-metadata';
import type { ISong } from '@/lib/music';

export interface ParsedMeta {
  title: string;
  artist: string;
  album: string;
  duration: number;
  codec: string;
  sampleRate: number;
  bitrate: number;
  cover: Blob | null;
}

function cleanName(value: string | undefined, fallback: string): string {
  const s = (value || '').trim();
  return s || fallback;
}

function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

/** Parse a local audio file: tags, duration, embedded album art. */
export async function parseAudioFile(file: File): Promise<ParsedMeta> {
  const md = await parseBlob(file, { duration: true });
  const common = md.common;
  const fmt = md.format;
  const picture = common.picture && common.picture[0];
  const cover =
    picture && picture.data && picture.data.length > 0
      ? new Blob([new Uint8Array(picture.data).buffer], {
          type: picture.format || 'image/jpeg',
        })
      : null;
  return {
    title: cleanName(common.title, stripExt(file.name)),
    artist: cleanName(common.artist, '未知艺术家'),
    album: cleanName(common.album, '未知专辑'),
    duration: fmt.duration || 0,
    codec: fmt.codec || fmt.container || 'AUDIO',
    sampleRate: fmt.sampleRate || 0,
    bitrate: fmt.bitrate ? Math.round(fmt.bitrate / 1000) : 0,
    cover,
  };
}

/**
 * Fallback artwork lookup (only used when a file has no embedded cover).
 * Returns null on any failure so import never blocks on network.
 */
export async function fetchItunesCover(
  artist: string,
  title: string,
  signal?: AbortSignal,
): Promise<Blob | null> {
  try {
    const term = encodeURIComponent(`${artist} ${title}`.slice(0, 120));
    const res = await fetch(
      `https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=1`,
      { signal },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: { artworkUrl100?: string }[] };
    const art = data?.results?.[0]?.artworkUrl100;
    if (!art) return null;
    const hiRes = art.replace('100x100bb', '600x600bb');
    const img = await fetch(hiRes, { signal });
    if (!img.ok) return null;
    return await img.blob();
  } catch {
    return null;
  }
}

/** Build the ISong record shape from parsed metadata (audio + fileName supplied by caller). */
export function toSong(
  meta: ParsedMeta,
  file: File,
  id: string,
  addedAt: number,
): ISong {
  return {
    id,
    title: meta.title,
    artist: meta.artist,
    album: meta.album,
    duration: meta.duration,
    codec: meta.codec,
    sampleRate: meta.sampleRate,
    bitrate: meta.bitrate,
    fileName: file.name,
    cover: meta.cover,
    audio: file,
    addedAt,
  };
}
