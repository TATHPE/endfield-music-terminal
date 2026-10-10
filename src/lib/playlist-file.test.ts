import { describe, expect, it } from 'vitest';
import {
  baseNameOf,
  classifyEntry,
  isPlaylistFileName,
  parsePlaylistFile,
} from '@/lib/playlist-file';

describe('isPlaylistFileName', () => {
  it('recognizes m3u / m3u8 / pls, case-insensitively', () => {
    expect(isPlaylistFileName('mix.m3u')).toBe(true);
    expect(isPlaylistFileName('mix.M3U')).toBe(true);
    expect(isPlaylistFileName('radio.m3u8')).toBe(true);
    expect(isPlaylistFileName('album.PLS')).toBe(true);
    expect(isPlaylistFileName('  spaced.m3u  ')).toBe(true);
  });

  it('rejects audio files and look-alike names', () => {
    expect(isPlaylistFileName('track.mp3')).toBe(false);
    expect(isPlaylistFileName('lyrics.lrc')).toBe(false);
    expect(isPlaylistFileName('mix.m3u.bak')).toBe(false);
    expect(isPlaylistFileName('m3u')).toBe(false);
    expect(isPlaylistFileName('')).toBe(false);
  });
});

describe('classifyEntry', () => {
  it('treats http and https as streams', () => {
    expect(classifyEntry('http://example.org/a.mp3')).toBe('stream');
    expect(classifyEntry('https://example.org/live')).toBe('stream');
    expect(classifyEntry('  HTTPS://example.org/a.mp3  ')).toBe('stream');
  });

  it('treats paths, relative paths and file: urls as local', () => {
    expect(classifyEntry('/sdcard/Music/a.mp3')).toBe('local');
    expect(classifyEntry('Music/a.mp3')).toBe('local');
    expect(classifyEntry('C:\\Music\\a.flac')).toBe('local');
    expect(classifyEntry('file:///sdcard/a.mp3')).toBe('local');
    expect(classifyEntry('../sibling/a.mp3')).toBe('local');
    expect(classifyEntry('')).toBe('local');
  });
});

describe('baseNameOf', () => {
  it('strips directories, query string and extension', () => {
    expect(baseNameOf('https://example.org/music/Bagatelle-No1.mp3?token=abc')).toBe(
      'Bagatelle-No1',
    );
    expect(baseNameOf('/sdcard/Music/晴天.flac')).toBe('晴天');
    expect(baseNameOf('C:\\Music\\Artist\\Track 01.m4a')).toBe('Track 01');
    expect(baseNameOf('relative/song.opus')).toBe('song');
  });

  it('decodes percent-encoded names', () => {
    expect(baseNameOf('https://example.org/%E6%99%B4%E5%A4%A9.mp3')).toBe('晴天');
    expect(baseNameOf('file:///sdcard/My%20Song.mp3')).toBe('My Song');
  });

  it('keeps names without an extension and tolerates empty input', () => {
    expect(baseNameOf('no-extension')).toBe('no-extension');
    expect(baseNameOf('https://example.org/stream?id=42')).toBe('stream');
    expect(baseNameOf('   ')).toBe('');
  });

  it('does not truncate a title that merely contains a dot', () => {
    expect(baseNameOf('Mr. Blue Sky')).toBe('Mr. Blue Sky');
    expect(baseNameOf('https://example.org/Mr.%20Blue%20Sky')).toBe('Mr. Blue Sky');
  });
});

describe('parsePlaylistFile — m3u / m3u8', () => {
  it('reads a plain m3u list', () => {
    const text = [
      '/sdcard/Music/a.mp3',
      'http://example.org/b.mp3',
      'Music/c.flac',
    ].join('\n');
    const r = parsePlaylistFile('mix.m3u', text);
    expect(r.entries).toEqual([
      { url: '/sdcard/Music/a.mp3' },
      { url: 'http://example.org/b.mp3' },
      { url: 'Music/c.flac' },
    ]);
    expect(r.skipped).toBe(0);
  });

  it('skips #EXTM3U, comments and blank lines without counting them', () => {
    const text = ['#EXTM3U', '', '   ', '# just a comment', '/a.mp3', '', '/b.mp3', ''].join(
      '\n',
    );
    const r = parsePlaylistFile('mix.m3u8', text);
    expect(r.entries.map((e) => e.url)).toEqual(['/a.mp3', '/b.mp3']);
    expect(r.skipped).toBe(0);
  });

  it('applies #EXTINF duration and title to the following line only', () => {
    const text = [
      '#EXTM3U',
      '#EXTINF:212,晴天',
      'http://example.org/qingtian.mp3',
      '#EXTINF:180',
      '/sdcard/NoTitle.mp3',
      '/sdcard/plain.mp3',
    ].join('\n');
    const r = parsePlaylistFile('mix.m3u', text);
    expect(r.entries).toEqual([
      { url: 'http://example.org/qingtian.mp3', title: '晴天', duration: 212 },
      { url: '/sdcard/NoTitle.mp3', duration: 180 },
      { url: '/sdcard/plain.mp3' },
    ]);
    expect(r.skipped).toBe(0);
  });

  it('omits duration when #EXTINF reports an unknown (-1) length', () => {
    const r = parsePlaylistFile('mix.m3u', '#EXTINF:-1,Live\nhttp://example.org/live.mp3\n');
    expect(r.entries).toEqual([
      { url: 'http://example.org/live.mp3', title: 'Live' },
    ]);
  });

  it('handles a fractional #EXTINF duration on a CRLF file', () => {
    const text = '#EXTM3U\r\n#EXTINF:95.5,Short One\r\n/D/a.mp3\r\n/D/b.mp3\r\n';
    const r = parsePlaylistFile('mix.m3u', text);
    expect(r.entries).toEqual([
      { url: '/D/a.mp3', title: 'Short One', duration: 95.5 },
      { url: '/D/b.mp3' },
    ]);
  });

  it('strips a BOM and surrounding whitespace, and tolerates lone CR', () => {
    const text = '\uFEFF  #EXTM3U \r  /a.mp3  \r\n   /b.mp3\r\n';
    const r = parsePlaylistFile('mix.m3u', text);
    expect(r.entries.map((e) => e.url)).toEqual(['/a.mp3', '/b.mp3']);
    expect(r.skipped).toBe(0);
  });

  it('counts garbled (control-byte / replacement-char) lines as skipped', () => {
    const text = ['/good.mp3', '\u0000\u0001\u0002', '\uFFFD\uFFFD', '/also-good.mp3'].join('\n');
    const r = parsePlaylistFile('mix.m3u', text);
    expect(r.entries.map((e) => e.url)).toEqual(['/good.mp3', '/also-good.mp3']);
    expect(r.skipped).toBe(2);
  });

  it('returns an empty result for a non-playlist file name', () => {
    expect(parsePlaylistFile('track.mp3', '/a.mp3\n/b.mp3\n')).toEqual({
      entries: [],
      skipped: 0,
    });
    expect(parsePlaylistFile('notes.txt', 'File1=http://example.org/a.mp3')).toEqual({
      entries: [],
      skipped: 0,
    });
  });
});

describe('parsePlaylistFile — pls', () => {
  it('pairs FileN / TitleN / LengthN', () => {
    const text = [
      '[playlist]',
      'File1=http://example.org/one.mp3',
      'Title1=One',
      'Length1=180',
      'File2=/sdcard/two.flac',
      'Title2=Two',
      'Length2=240',
      'NumberOfEntries=2',
      'Version=2',
    ].join('\r\n');
    const r = parsePlaylistFile('mix.pls', text);
    expect(r.entries).toEqual([
      { url: 'http://example.org/one.mp3', title: 'One', duration: 180 },
      { url: '/sdcard/two.flac', title: 'Two', duration: 240 },
    ]);
    expect(r.skipped).toBe(0);
  });

  it('emits entries in ascending N order even when the file is out of order', () => {
    const text = ['File3=/c.mp3', 'File1=/a.mp3', 'File2=/b.mp3', 'Title2=B'].join('\n');
    const r = parsePlaylistFile('mix.pls', text);
    expect(r.entries).toEqual([
      { url: '/a.mp3' },
      { url: '/b.mp3', title: 'B' },
      { url: '/c.mp3' },
    ]);
    expect(r.skipped).toBe(0);
  });

  it('accepts an entry without Title/Length and drops an unusable Length', () => {
    const text = ['File1=/a.mp3', 'File2=/b.mp3', 'Length2=-1'].join('\n');
    const r = parsePlaylistFile('mix.pls', text);
    expect(r.entries).toEqual([{ url: '/a.mp3' }, { url: '/b.mp3' }]);
    // Length2=-1 是无效行（未知时长）
    expect(r.skipped).toBe(1);
  });

  it('counts unknown keys, empty File values and orphan slots as skipped', () => {
    const text = [
      '[playlist]',
      'NumberOfEntries=3',
      '; comment',
      'File1=http://example.org/one.mp3',
      'Title1=One',
      'Title2=Lonely',
      'Bogus=1',
      'File3=',
      'File3=/c.mp3',
      'Title3=Three',
    ].join('\n');
    const r = parsePlaylistFile('mix.pls', text);
    expect(r.entries).toEqual([
      { url: 'http://example.org/one.mp3', title: 'One' },
      { url: '/c.mp3', title: 'Three' },
    ]);
    // Title2 孤儿编号(1) + Bogus 未知键(1) + File3= 空值(1)
    expect(r.skipped).toBe(3);
  });

  it('is tolerant of BOM, CRLF, blank lines and mixed-case keys', () => {
    const text = '\uFEFF[PLAYLIST]\r\n\r\nFILE1=HTTP://example.org/a.mp3\r\nTITLE1=A\r\nLENGTH1=12\r\n';
    const r = parsePlaylistFile('mix.pls', text);
    expect(r.entries).toEqual([{ url: 'HTTP://example.org/a.mp3', title: 'A', duration: 12 }]);
    expect(classifyEntry('HTTP://example.org/a.mp3')).toBe('stream');
    expect(r.skipped).toBe(0);
  });

  it('returns no entries for an empty pls body', () => {
    expect(parsePlaylistFile('mix.pls', '')).toEqual({ entries: [], skipped: 0 });
    expect(parsePlaylistFile('mix.pls', '[playlist]\nNumberOfEntries=0\n')).toEqual({
      entries: [],
      skipped: 0,
    });
  });
});
