// EXPORTS: SearchView
import { useMemo, useRef, useState } from 'react';
import { ChevronDown, Heart, ListMusic, ListPlus, Play, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePlayer } from '@/lib/player-context';
import HazardStrip from '@/components/player/HazardStrip';
import PlaylistAddSheet from '@/components/player/PlaylistAddSheet';
import { parseQuery, searchLibrary } from '@/lib/search';
import { ACTIONS, PAGES, STATES, playLabel, playlistAddLabel } from '@/lib/strings';

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Global search — filters the local media library and playback sequences
 *  by keyword or the advanced syntax (artist:/album:/tag:/duration:<>N). */
export default function SearchView() {
  const { songs, playlists, playSong, playPlaylist, currentId, isPlaying, toggleFavorite } = usePlayer();
  const [query, setQuery] = useState('');
  const [syntaxOpen, setSyntaxOpen] = useState(false);
  /** song id whose 「加入播放序列」 sheet is open */
  const [addTarget, setAddTarget] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const q = query.trim();
  const tokens = parseQuery(q);
  const hasSyntax = tokens.some((t) => t.kind !== 'keyword');

  // Query parsing and matching live in src/lib/search.ts so they stay unit-tested.
  const results = useMemo(() => searchLibrary(q, songs, playlists), [q, songs, playlists]);

  const total = results.songs.length + results.playlists.length;

  return (
    <div className="flex h-full flex-col gap-3 px-4 pb-6 pt-4">
      <header className="flex items-center justify-between">
        <h2 className="font-mono text-xs tracking-[0.34em] text-foreground">
          SEARCH <span className="text-muted-foreground">// {PAGES.SEARCH}</span>
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
          placeholder="搜索歌曲 / 艺术家 / 播放序列…"
          enterKeyHint="search"
          className="w-full border border-border bg-card py-3 pl-9 pr-9 font-mono text-sm tracking-wider text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/60 focus:border-accent/60 focus:shadow-[0_0_0_1px] focus:shadow-accent/30"
          style={{ clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%)' }}
        />
        {query && (
          <button
            type="button"
            aria-label={ACTIONS.CLEAR}
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
          <p>duration:&gt;300 — 时长大于 300 秒</p>
          <p className="mt-1 text-foreground/50">多个条件用空格组合（AND 关系）</p>
        </div>
      )}

      {!q ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <Search className="h-8 w-8 text-foreground/15" strokeWidth={1.4} />
          <p className="font-mono text-[11px] tracking-[0.22em] text-muted-foreground">
            输入关键词检索本地介质库与播放序列
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
              <h3 className="font-mono text-[10px] tracking-[0.28em] text-accent">PLAYLISTS // {PAGES.PLAYLISTS}</h3>
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
                      aria-label={playLabel(s.title)}
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
                        {s.artist || STATES.UNKNOWN_ARTIST} · {s.album || STATES.UNKNOWN_ALBUM}
                      </span>
                    </button>
                    <span className="shrink-0 font-mono text-[9px] tracking-widest text-muted-foreground">
                      {fmt(s.duration)}
                    </span>
                    <button
                      type="button"
                      aria-label={s.favorited ? ACTIONS.UNFAVORITE : ACTIONS.FAVORITE}
                      onClick={() => toggleFavorite(s.id)}
                      className={cn('shrink-0 p-1 transition-colors', s.favorited ? 'text-accent' : 'text-muted-foreground hover:text-foreground')}
                    >
                      <Heart className="h-3.5 w-3.5" fill={s.favorited ? 'currentColor' : 'none'} />
                    </button>
                    <button
                      type="button"
                      aria-label={playlistAddLabel(s.title)}
                      onClick={() => setAddTarget(s.id)}
                      className="shrink-0 p-1 text-muted-foreground transition-colors hover:text-accent"
                    >
                      <ListPlus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </section>
          )}
        </div>
      )}

      <PlaylistAddSheet
        open={addTarget !== null}
        songId={addTarget}
        onClose={() => setAddTarget(null)}
      />
    </div>
  );
}
