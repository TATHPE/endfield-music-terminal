// EXPORTS: SearchView
import { useMemo, useRef, useState } from 'react';
import { ChevronDown, Heart, ListMusic, Play, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePlayer } from '@/lib/player-context';
import HazardStrip from '@/components/player/HazardStrip';
import type { ISong } from '@/lib/music';

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface QueryToken {
  kind: 'keyword' | 'artist' | 'album' | 'tag' | 'duration';
  value: string;
  /** duration max in seconds */
  maxSec: number;
}

/** Split the raw query into advanced-search tokens.
 *  artist:/album:/tag: match substrings; duration:<N matches tracks shorter
 *  than N seconds; bare words match title/artist/album. Tokens AND together. */
function parseQuery(raw: string): QueryToken[] {
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
    const dur = part.match(/^duration:<(\d+)$/i);
    if (dur) {
      tokens.push({ kind: 'duration', value: '', maxSec: Number(dur[1]) });
      continue;
    }
    tokens.push({ kind: 'keyword', value: part.toLowerCase(), maxSec: 0 });
  }
  return tokens;
}

function songMatches(song: ISong, token: QueryToken): boolean {
  switch (token.kind) {
    case 'artist':
      return song.artist.toLowerCase().includes(token.value);
    case 'album':
      return song.album.toLowerCase().includes(token.value);
    case 'tag':
      return (song.tags ?? []).some((t) => t.toLowerCase().includes(token.value));
    case 'duration':
      return song.duration > 0 && song.duration < token.maxSec;
    default:
      return (
        song.title.toLowerCase().includes(token.value) ||
        song.artist.toLowerCase().includes(token.value) ||
        song.album.toLowerCase().includes(token.value)
      );
  }
}

/** Global search — filters the local media library and playback sequences
 *  by keyword or the advanced syntax (artist:/album:/tag:/duration:<N). */
export default function SearchView() {
  const { songs, playlists, playSong, playPlaylist, currentId, isPlaying, toggleFavorite } = usePlayer();
  const [query, setQuery] = useState('');
  const [syntaxOpen, setSyntaxOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const q = query.trim();
  const tokens = parseQuery(q);
  const hasSyntax = tokens.some((t) => t.kind !== 'keyword');

  const results = useMemo(() => {
    if (!q) return { songs: [], playlists: [] };
    const songHits = songs.filter((s) => tokens.every((t) => songMatches(s, t)));
    const keywordOnly = tokens.every((t) => t.kind === 'keyword');
    const plHits = keywordOnly
      ? playlists.filter((p) =>
          tokens.some((t) => p.name.toLowerCase().includes(t.value)),
        )
      : [];
    return { songs: songHits, playlists: plHits };
  }, [q, tokens, songs, playlists]);

  const total = results.songs.length + results.playlists.length;

  return (
    <div className="flex h-full flex-col gap-3 px-4 pb-6 pt-4">
      <header className="flex items-center justify-between">
        <h2 className="font-mono text-xs tracking-[0.34em] text-foreground">
          SEARCH <span className="text-muted-foreground">// 全域检索</span>
        </h2>
        <span className="font-mono text-[9px] tracking-widest text-muted-foreground">SYS-SEARCH</span>
      </header>

      {/* Query input */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索歌曲 / 艺术家 / 歌单…"
          enterKeyHint="search"
          className="w-full border border-border bg-card py-3 pl-9 pr-9 font-mono text-sm tracking-wider text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/60 focus:border-accent/60 focus:shadow-[0_0_0_1px] focus:shadow-accent/30"
          style={{ clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%)' }}
        />
        {query && (
          <button
            type="button"
            aria-label="清空"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <HazardStrip className="h-[2px] opacity-50" />

      {/* Advanced syntax collapsible */}
      <button
        type="button"
        onClick={() => setSyntaxOpen((v) => !v)}
        className="flex items-center justify-between font-mono text-[9px] tracking-[0.22em] text-muted-foreground transition-colors hover:text-primary"
      >
        <span>{hasSyntax ? 'ADVANCED QUERY ACTIVE' : '高级检索语法'}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', syntaxOpen && 'rotate-180')} />
      </button>
      {syntaxOpen && (
        <div className="border border-border/70 bg-background/60 px-3 py-2 font-mono text-[9px] leading-relaxed tracking-wider text-muted-foreground">
          <p>artist:xxx — 按艺术家筛选</p>
          <p>album:xxx — 按专辑筛选</p>
          <p>tag:战场记录 — 按介质标签筛选</p>
          <p>duration:&lt;120 — 时长小于 120 秒</p>
          <p className="mt-1 text-foreground/50">多个条件用空格组合（AND 关系）</p>
        </div>
      )}

      {!q ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <Search className="h-8 w-8 text-foreground/15" strokeWidth={1.4} />
          <p className="font-mono text-[11px] tracking-[0.22em] text-muted-foreground">
            输入关键词检索本地曲库与歌单
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto no-scrollbar">
          <div className="flex items-center justify-between font-mono text-[9px] tracking-[0.26em] text-muted-foreground">
            <span>QUERY “{q}”</span>
            <span>{total} HIT{total === 1 ? '' : 'S'}</span>
          </div>

          {total === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2">
              <span className="font-mono text-[11px] tracking-[0.2em] text-foreground/40">NO MATCH</span>
              <span className="font-mono text-[10px] tracking-wider text-muted-foreground/70">
                未找到与 “{q}” 匹配的内容
              </span>
            </div>
          )}

          {results.playlists.length > 0 && (
            <section className="flex flex-col gap-1.5">
              <h3 className="font-mono text-[10px] tracking-[0.28em] text-accent">PLAYLISTS // 歌单</h3>
              {results.playlists.map((pl) => (
                <button
                  key={pl.id}
                  type="button"
                  onClick={() => playPlaylist(pl.id)}
                  className="flex items-center gap-3 border border-border bg-card/70 p-2.5 text-left transition-colors hover:border-accent/50"
                  style={{ clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%)' }}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-white/10 bg-muted text-accent">
                    <ListMusic className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">{pl.name}</span>
                    <span className="block font-mono text-[9px] tracking-widest text-muted-foreground">
                      {pl.songIds.length} TRACKS
                    </span>
                  </span>
                  <Play className="h-3.5 w-3.5 shrink-0 text-accent" />
                </button>
              ))}
            </section>
          )}

          {results.songs.length > 0 && (
            <section className="flex flex-col gap-1.5">
              <h3 className="font-mono text-[10px] tracking-[0.28em] text-accent">TRACKS // 歌曲</h3>
              {results.songs.map((s) => {
                const playing = s.id === currentId && isPlaying;
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 border border-border bg-card/70 p-2.5 transition-colors"
                    style={{ clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%)' }}
                  >
                    <button
                      type="button"
                      aria-label={`播放 ${s.title}`}
                      onClick={() => playSong(s.id)}
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center border transition-colors',
                        playing
                          ? 'border-accent bg-accent text-background'
                          : 'border-white/10 bg-muted text-accent hover:border-accent/60',
                      )}
                    >
                      <Play className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => playSong(s.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className={cn('block truncate text-sm', playing ? 'text-accent' : 'font-semibold text-foreground')}>
                        {s.title}
                      </span>
                      <span className="block truncate font-mono text-[9px] tracking-wider text-muted-foreground">
                        {s.artist || '未知艺术家'} · {s.album || '未知专辑'}
                      </span>
                    </button>
                    <span className="shrink-0 font-mono text-[9px] tracking-widest text-muted-foreground">
                      {fmt(s.duration)}
                    </span>
                    <button
                      type="button"
                      aria-label={s.favorited ? '取消收藏' : '收藏'}
                      onClick={() => toggleFavorite(s.id)}
                      className={cn('shrink-0 p-1 transition-colors', s.favorited ? 'text-accent' : 'text-muted-foreground hover:text-foreground')}
                    >
                      <Heart className="h-3.5 w-3.5" fill={s.favorited ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                );
              })}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
