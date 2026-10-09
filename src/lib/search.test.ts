import { describe, expect, it } from 'vitest';
import { parseQuery, searchLibrary, songMatches } from '@/lib/search';
import type { ISong } from '@/lib/music';
import type { Playlist } from '@/lib/playlists';

function song(over: Partial<ISong> = {}): ISong {
  return {
    id: 's1',
    title: 'New Frontier',
    artist: '铁痕电台-MSR',
    album: '明日方舟：终末地',
    duration: 231,
    codec: 'MP3',
    sampleRate: 48000,
    bitrate: 265,
    fileName: '01.mp3',
    cover: null,
    audio: null,
    addedAt: 1,
    ...over,
  };
}

function playlist(name: string): Playlist {
  return { id: `p-${name}`, name, songIds: [], createdAt: 1 };
}

describe('parseQuery', () => {
  it('returns nothing for an empty query', () => {
    expect(parseQuery('')).toEqual([]);
    expect(parseQuery('   ')).toEqual([]);
  });

  it('lower-cases bare keywords and splits on whitespace', () => {
    expect(parseQuery('Hello WORLD')).toEqual([
      { kind: 'keyword', value: 'hello', maxSec: 0 },
      { kind: 'keyword', value: 'world', maxSec: 0 },
    ]);
  });

  it('parses the advanced prefixes', () => {
    expect(parseQuery('artist:周杰伦')[0]).toMatchObject({ kind: 'artist', value: '周杰伦' });
    expect(parseQuery('album:启程之前')[0]).toMatchObject({ kind: 'album', value: '启程之前' });
    expect(parseQuery('tag:BGM')[0]).toMatchObject({ kind: 'tag', value: 'bgm' });
    expect(parseQuery('duration:<120')[0]).toMatchObject({ kind: 'duration', maxSec: 120 });
  });

  it('treats unsupported syntax as a keyword', () => {
    expect(parseQuery('duration:>120')[0]).toMatchObject({ kind: 'keyword', value: 'duration:>120' });
    expect(parseQuery('artist:')[0]).toMatchObject({ kind: 'keyword', value: 'artist:' });
  });

  it('splits on whitespace and keeps the order', () => {
    const kinds = parseQuery('artist:a tag:b 关键词 duration:<60').map((t) => t.kind);
    expect(kinds).toEqual(['artist', 'tag', 'keyword', 'duration']);
  });
});

describe('songMatches', () => {
  const s = song({ tags: ['战场记录'] });

  it('matches artist / album / tag substrings', () => {
    expect(songMatches(s, { kind: 'artist', value: 'msr', maxSec: 0 })).toBe(true);
    expect(songMatches(s, { kind: 'album', value: '终末地', maxSec: 0 })).toBe(true);
    expect(songMatches(s, { kind: 'tag', value: '战场', maxSec: 0 })).toBe(true);
    expect(songMatches(s, { kind: 'tag', value: '环境音', maxSec: 0 })).toBe(false);
  });

  it('matches duration only for known, shorter tracks', () => {
    expect(songMatches(s, { kind: 'duration', value: '', maxSec: 300 })).toBe(true);
    expect(songMatches(s, { kind: 'duration', value: '', maxSec: 60 })).toBe(false);
    // unknown duration (0) never matches a "shorter than" filter
    expect(songMatches(song({ duration: 0 }), { kind: 'duration', value: '', maxSec: 600 })).toBe(false);
  });

  it('matches bare keywords against title, artist and album', () => {
    expect(songMatches(s, { kind: 'keyword', value: 'frontier', maxSec: 0 })).toBe(true);
    expect(songMatches(s, { kind: 'keyword', value: 'msr', maxSec: 0 })).toBe(true);
    expect(songMatches(s, { kind: 'keyword', value: 'nope', maxSec: 0 })).toBe(false);
  });
});

describe('searchLibrary', () => {
  const songs = [song(), song({ id: 's2', title: 'Vermilion', artist: 'Jun', duration: 100 })];
  const playlists = [playlist('夜间电台'), playlist('战场集合')];

  it('returns nothing for an empty query', () => {
    expect(searchLibrary('', songs, playlists)).toEqual({ songs: [], playlists: [] });
  });

  it('ANDS the tokens for songs', () => {
    expect(searchLibrary('artist:jun duration:<120', songs, playlists).songs.map((s) => s.id)).toEqual(['s2']);
    expect(searchLibrary('artist:jun duration:<50', songs, playlists).songs).toEqual([]);
  });

  it('only matches playlists for plain keyword queries', () => {
    expect(searchLibrary('电台', songs, playlists).playlists.map((p) => p.name)).toEqual(['夜间电台']);
    expect(searchLibrary('tag:战场记录', songs, playlists).playlists).toEqual([]);
  });
});
