// EXPORTS: QueryToken, parseQuery, songMatches, searchLibrary
import type { ISong } from '@/lib/music';
import type { Playlist } from '@/lib/playlists';

export interface QueryToken {
  kind: 'keyword' | 'artist' | 'album' | 'tag' | 'duration';
  value: string;
  /** duration max in seconds */
  maxSec: number;
}

/**
 * Split a raw query into advanced-search tokens.
 *
 * - `artist:` / `album:` / `tag:` match substrings (case-insensitive)
 * - `duration:<N` / `duration:>N` matches tracks shorter / longer than N seconds
 * - bare words match title / artist / album
 *
 * Tokens are ANDed together. Anything else (e.g. `duration:N`) falls back to a
 * plain keyword so the query still does something sensible.
 */
export function parseQuery(raw: string): QueryToken[] {
  const tokens: QueryToken[] = [];
  for (const part of raw.split(/\s+/)) {
    if (!part) continue;
    const artist = part.match(/^artist:(.+)$/i);
    if (artist) {
      tokens.push({ kind: 'artist', value: artist[1].toLowerCase(), maxSec: 0 });
      continue;
    }
    const album = part.match(/^album:(.+)$/i);
    if (album) {
      tokens.push({ kind: 'album', value: album[1].toLowerCase(), maxSec: 0 });
      continue;
    }
    const tag = part.match(/^tag:(.+)$/i);
    if (tag) {
      tokens.push({ kind: 'tag', value: tag[1].toLowerCase(), maxSec: 0 });
      continue;
    }
    const dur = part.match(/^duration:([<>])(\d+)$/i);
    if (dur) {
      // `value` carries the comparison operator ('<' or '>').
      tokens.push({ kind: 'duration', value: dur[1], maxSec: Number(dur[2]) });
      continue;
    }
    tokens.push({ kind: 'keyword', value: part.toLowerCase(), maxSec: 0 });
  }
  return tokens;
}

export function songMatches(song: ISong, token: QueryToken): boolean {
  switch (token.kind) {
    case 'artist':
      return song.artist.toLowerCase().includes(token.value);
    case 'album':
      return song.album.toLowerCase().includes(token.value);
    case 'tag':
      return (song.tags ?? []).some((t) => t.toLowerCase().includes(token.value));
    case 'duration':
      // Unknown durations (0) never match a length filter.
      if (song.duration <= 0) return false;
      return token.value === '>' ? song.duration > token.maxSec : song.duration < token.maxSec;
    default:
      return (
        song.title.toLowerCase().includes(token.value) ||
        song.artist.toLowerCase().includes(token.value) ||
        song.album.toLowerCase().includes(token.value)
      );
  }
}

/** Filter the local media library and the playback sequences for a query. */
export function searchLibrary(
  query: string,
  songs: ISong[],
  playlists: Playlist[],
): { songs: ISong[]; playlists: Playlist[] } {
  const q = query.trim();
  if (!q) return { songs: [], playlists: [] };
  const tokens = parseQuery(q);
  const songHits = songs.filter((s) => tokens.every((t) => songMatches(s, t)));
  // Playlist names only take part in plain keyword searches.
  const keywordOnly = tokens.every((t) => t.kind === 'keyword');
  const playlistHits = keywordOnly
    ? playlists.filter((p) => tokens.some((t) => p.name.toLowerCase().includes(t.value)))
    : [];
  return { songs: songHits, playlists: playlistHits };
}
