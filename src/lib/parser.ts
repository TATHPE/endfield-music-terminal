// EXPORTS: ParsedMeta, parseAudioFile, fetchItunesCover, fallbackMeta
import { parseBlob, type IAudioMetadata, type IPicture, type ILyricsTag } from 'music-metadata';
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
  lyrics?: string;
}

function cleanName(value: string | undefined, fallback: string): string {
  const s = (value || '').trim();
  return s || fallback;
}

export function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

/** Format a sync timestamp (ms) as an LRC tag [mm:ss.xx]. */
function fmtSyncTime(ms: number): string {
  const safe = Math.max(0, ms);
  const m = Math.floor(safe / 60000);
  const s = Math.floor((safe % 60000) / 1000);
  const cs = Math.floor((safe % 1000) / 10);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/** Flatten music-metadata lyrics tags into a single LRC-ish text blob. */
function extractLyrics(tags: ILyricsTag[] | undefined): string | undefined {
  if (!tags || tags.length === 0) return undefined;
  const blocks: string[] = [];
  for (const tag of tags) {
    if (tag.syncText && tag.syncText.length > 0) {
      // Synchronized lyrics → rebuild LRC lines from timestamps (ms).
      const lines = tag.syncText
        .map((t) => `[${fmtSyncTime(t.timestamp ?? 0)}]${t.text}`)
        .join('\n');
      blocks.push(lines);
    } else if (tag.text && tag.text.trim()) {
      blocks.push(tag.text.trim());
    }
  }
  const out = blocks.join('\n\n').trim();
  return out || undefined;
}

/**
 * Detect the real image MIME from magic bytes.
 * Many files carry a wrong/empty APIC format string ('image/jpg', 'JPG',
 * blank, or a literal '-->' URL), so we trust the bytes over the tag.
 */
export function detectImageType(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38
  ) {
    return 'image/gif';
  }
  if (bytes.length >= 4 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return 'image/bmp';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return '';
}

/** Build a Blob from a picture frame, fixing up the MIME from magic bytes. */
function pictureToBlob(picture: IPicture | undefined): Blob | null {
  if (!picture || !picture.data || picture.data.length === 0) return null;
  const bytes = picture.data instanceof Uint8Array
    ? picture.data
    : new Uint8Array(picture.data as ArrayBuffer);
  const sniffed = detectImageType(bytes);
  const declared = (picture.format || '').trim().toLowerCase();
  // Reject bogus declarations like '-->' (URL reference) or non-image MIME.
  const usableDeclared = declared.startsWith('image/') ? declared : '';
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return new Blob([copy as Uint8Array<ArrayBuffer>], {
    type: sniffed || usableDeclared || 'image/jpeg',
  });
}

/**
 * Defensive scan of the raw native tag frames for album art.
 * music-metadata normally maps APIC/PIC into common.picture, but some files
 * (odd ID3v2.2 PIC frames, WMA/APE pictures, multi-cover files) only expose
 * the art through the native dictionary — this picks the first usable frame.
 */
function extractPictureNative(md: IAudioMetadata): IPicture | undefined {
  const dict = md.native as Record<string, Array<{ id?: string; value: unknown }>> | undefined;
  if (!dict) return undefined;
  for (const frames of Object.values(dict)) {
    if (!Array.isArray(frames)) continue;
    for (const frame of frames) {
      const id = String(frame?.id || '').toUpperCase();
      if (id !== 'APIC' && id !== 'PIC' && id !== 'PICTURE') continue;
      const v = frame?.value as
        | IPicture
        | { format?: string; data?: unknown }
        | string
        | undefined;
      if (!v) continue;
      if (typeof v === 'object' && v.data) {
        const data = v.data as Uint8Array | ArrayBuffer;
        const len = data instanceof Uint8Array ? data.length : (data as ArrayBuffer).byteLength;
        if (len > 0) {
          const pic: IPicture = {
            format: (v as { format?: string }).format || '',
            data: data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer),
          };
          return pic;
        }
      }
      // '-->' URL references cannot be embedded; skip strings.
    }
  }
  return undefined;
}

/**
 * Parse a local audio file: tags, duration, embedded album art, lyrics.
 * Never throws: on broken/unparseable tags it returns a minimal record so the
 * track still imports (cover then comes from the iTunes fallback, if any).
 */
export async function parseAudioFile(file: File): Promise<ParsedMeta> {
  let md: IAudioMetadata;
  try {
    md = await parseBlob(file, { duration: true });
  } catch {
    try {
      md = await parseBlob(file, { duration: false });
    } catch {
      return {
        title: cleanName(undefined, stripExt(file.name)),
        artist: '未知艺术家',
        album: '未知专辑',
        duration: 0,
        codec: file.type ? file.type.replace('audio/', '') : 'AUDIO',
        sampleRate: 0,
        bitrate: 0,
        cover: null,
      };
    }
  }
  const common = md.common;
  const fmt = md.format;
  const cover = pictureToBlob(common.picture?.[0]) ?? pictureToBlob(extractPictureNative(md));
  return {
    title: cleanName(common.title, stripExt(file.name)),
    artist: cleanName(common.artist, '未知艺术家'),
    album: cleanName(common.album, '未知专辑'),
    duration: fmt.duration || 0,
    codec: fmt.codec || fmt.container || 'AUDIO',
    sampleRate: fmt.sampleRate || 0,
    bitrate: fmt.bitrate ? Math.round(fmt.bitrate / 1000) : 0,
    cover,
    lyrics: extractLyrics(common.lyrics),
  };
}

interface ItunesResult {
  artworkUrl100?: string;
  collectionName?: string;
  trackName?: string;
  artistName?: string;
}

/**
 * Fallback artwork lookup (only used when a file has no embedded cover).
 * Strategy: prefer an exact album match (most reliable cover), then a
 * track-title match without the (often useless) artist field, then artist+title.
 * Returns null on any failure so import never blocks on network.
 */
export async function fetchItunesCover(
  artist: string,
  title: string,
  album?: string,
  signal?: AbortSignal,
): Promise<Blob | null> {
  const cleanArtist = artist === '未知艺术家' ? '' : artist;
  const cleanAlbum = album && album !== '未知专辑' ? album : '';
  const queries: string[] = [];
  if (cleanAlbum) queries.push(cleanAlbum);
  if (title) queries.push(cleanArtist ? `${cleanArtist} ${title}` : title);

  for (const q of queries) {
    try {
      const term = encodeURIComponent(q.slice(0, 120));
      const res = await fetch(
        `https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=8`,
        { signal },
      );
      if (!res.ok) continue;
      const data = (await res.json()) as { results?: ItunesResult[] };
      const results = data?.results || [];
      if (results.length === 0) continue;
      // Prefer a hit whose track name matches the title closely.
      let hit: ItunesResult | undefined;
      if (title) {
        const t = title.toLowerCase();
        hit = results.find((r) => (r.trackName || '').toLowerCase() === t)
          ?? results.find((r) => (r.trackName || '').toLowerCase().includes(t));
      }
      hit = hit ?? results.find((r) => !!r.artworkUrl100);
      const art = hit?.artworkUrl100;
      if (!art) continue;
      const hiRes = art.replace('100x100bb', '600x600bb');
      const img = await fetch(hiRes, { signal });
      if (!img.ok) continue;
      return await img.blob();
    } catch {
      continue;
    }
  }
  return null;
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
    lyrics: meta.lyrics,
    audio: file,
    addedAt,
  };
}
