// EXPORTS: LyricsView
import { useEffect, useMemo, useRef, useState } from 'react';
import { CloudDownload, FileUp, List, ScrollText } from 'lucide-react';
import { parseLrc, type LrcLine } from '@/lib/lyrics';
import { usePlayer } from '@/lib/player-context';
import { cn } from '@/lib/utils';
import { LABELS, STATES } from '@/lib/strings';

const OFFSET_KEY = 'endfield-player:lyric-offset';
const OFFSET_STEPS = [-1, -0.5, 0.5, 1] as const;
type LyricMode = 'scroll' | 'log';

interface LyricsViewProps {
  /** extra top padding for the scroll container so the active line can center */
  className?: string;
}

/** Find the index of the active lyric line for the current time. */
function findActive(lines: LrcLine[], time: number): number {
  let idx = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (time >= lines[i].time) idx = i;
    else break;
  }
  return idx;
}

/** Synchronized lyrics in terminal style: scroll mode centers the active line,
 *  log mode renders the full stream as a fixed readout with the active line
 *  highlighted. A per-device sync offset shifts the whole timeline in ±0.5s
 *  steps and persists across tracks. */
export default function LyricsView({ className = '' }: LyricsViewProps) {
  const { currentSong, currentTime, fetchLyricsOnline, importLyrics } = usePlayer();
  const [offset, setOffset] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem(OFFSET_KEY));
      return Number.isFinite(v) ? v : 0;
    } catch {
      return 0;
    }
  });
  const [mode, setMode] = useState<LyricMode>('scroll');
  const parsed = useMemo(
    () => parseLrc(currentSong?.lyrics ?? '', offset),
    [currentSong?.lyrics, offset],
  );
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  /** LOG 模式的滚动容器：全量铺开但可滚动，并把当前行自动滚入视野 */
  const logRef = useRef<HTMLDivElement | null>(null);
  const activeLineRef = useRef<HTMLDivElement | null>(null);
  const lastIdxRef = useRef(-1);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fetching, setFetching] = useState(false);

  const adjustOffset = (delta: number) => {
    setOffset((prev) => {
      const next = Math.round((prev + delta) * 10) / 10;
      try {
        localStorage.setItem(OFFSET_KEY, String(next));
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  };

  // Derived from render: the active line is a pure function of currentTime.
  const activeIdx = parsed?.kind === 'timed' ? findActive(parsed.lines, currentTime) : -1;

  // Reset scroll tracking when the track / lyric shape changes.
  useEffect(() => {
    lastIdxRef.current = -1;
    const scroller = scrollerRef.current;
    if (scroller) scroller.scrollTop = 0;
  }, [currentSong?.id, parsed?.kind]);

  // Keep the active line centered inside the scroll container (only on index change).
  // Instant snap (behavior:auto), not smooth: on dense passages a new smooth
  // scroll starts before the previous one finishes, so the container keeps
  // chasing the timeline and lyrics visibly lag the audio.
  useEffect(() => {
    if (activeIdx === lastIdxRef.current) return;
    lastIdxRef.current = activeIdx;
    const scroller = scrollerRef.current;
    const el = activeLineRef.current;
    if (!scroller || !el) return;
    const target = el.offsetTop - scroller.clientHeight / 2 + el.clientHeight / 2;
    scroller.scrollTo({ top: Math.max(0, target), behavior: 'auto' });
  }, [activeIdx]);

  // LOG 模式：整首铺开，但把当前行滚入视野（此前容器 overflow-hidden，
  // 歌词一长就会被裁掉、当前行也可能看不见）。
  useEffect(() => {
    if (mode !== 'log') return;
    const scroller = logRef.current;
    if (!scroller) return;
    const active = scroller.querySelector<HTMLElement>(`[data-log-line="${activeIdx}"]`);
    if (!active) return;
    const target = active.offsetTop - scroller.clientHeight / 2 + active.clientHeight / 2;
    scroller.scrollTo({ top: Math.max(0, target), behavior: 'auto' });
  }, [mode, activeIdx]);

  /** User explicitly opted in to an online lyric lookup for this track. */
  const handleFetchOnline = async () => {
    if (!currentSong || fetching) return;
    setFetching(true);
    try {
      await fetchLyricsOnline(currentSong.id);
    } finally {
      setFetching(false);
    }
  };

  /** User picked a local .lrc/.txt file to attach as this track's lyrics. */
  const handleImportFile = async (file: File | undefined) => {
    if (!file || !currentSong) return;
    const text = await file.text();
    await importLyrics(currentSong.id, text);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (!currentSong) {
    return (
      <div className={cn('flex flex-col items-center justify-center gap-3 py-16 text-center', className)}>
        <span className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground">
          LYRIC STREAM // NOT FOUND
        </span>
        <p className="font-mono text-sm text-muted-foreground/70">NO ACTIVE TRACK</p>
      </div>
    );
  }

  if (!parsed) {
    return (
      <div className={cn('flex h-full flex-col items-center justify-center gap-3 px-6 text-center', className)}>
        <span className="font-mono text-[10px] tracking-[0.3em] text-destructive">
          LYRIC STREAM NOT FOUND
        </span>
        <p className="text-base font-semibold text-foreground">{STATES.NO_LYRICS}</p>
        <p className="px-4 font-mono text-[11px] leading-relaxed tracking-wider text-muted-foreground/60">
          文件内嵌歌词与同名 .lrc 均不可用。
          <br />
          可向远端节点请求歌词，或导入本地脚本。
        </p>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={handleFetchOnline}
            disabled={fetching}
            className="clip-corner-sm flex items-center gap-1.5 border border-primary/50 bg-primary/10 px-3.5 py-2 font-mono text-[11px] tracking-widest text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
          >
            <CloudDownload className="h-3.5 w-3.5" />
            {fetching ? 'LINKING…' : 'REQUEST REMOTE LYRIC'}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="clip-corner-sm flex items-center gap-1.5 border border-border bg-secondary px-3.5 py-2 font-mono text-[11px] tracking-widest text-foreground transition-colors hover:text-primary"
          >
            <FileUp className="h-3.5 w-3.5" />
            IMPORT LOCAL SCRIPT
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".lrc,.txt"
          className="hidden"
          onChange={(e) => void handleImportFile(e.target.files?.[0])}
        />
      </div>
    );
  }

  if (parsed.kind === 'plain') {
    return (
      <div className={cn('relative px-6 py-6', className)}>
        <p className="whitespace-pre-line text-center font-mono text-[13px] leading-7 tracking-wide text-foreground/85">
          {parsed.text}
        </p>
      </div>
    );
  }

  const { lines } = parsed;
  const offsetLabel = offset === 0 ? 'SYNC 0.0s' : `SYNC ${offset > 0 ? '+' : ''}${offset.toFixed(1)}s`;

  return (
    <div className={cn('relative flex h-full flex-col overflow-hidden', className)}>
      {/* timeline sync + view mode toolbar */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/70 bg-background/80 px-2 py-1.5">
        <div className="flex items-center gap-1">
          {OFFSET_STEPS.map((step) => (
            <button
              key={step}
              type="button"
              onClick={() => adjustOffset(step)}
              className="clip-corner-sm border border-border/70 bg-secondary/60 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground transition-colors hover:text-primary"
            >
              {step > 0 ? `+${step}s` : `${step}s`}
            </button>
          ))}
        </div>
        <span className={cn('font-mono text-[9px] tracking-[0.16em]', offset === 0 ? 'text-muted-foreground' : 'text-primary')}>
          {offsetLabel}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMode('scroll')}
            aria-label={LABELS.SCROLL_MODE}
            className={cn(
              'clip-corner-sm flex items-center gap-1 border px-2 py-0.5 font-mono text-[9px] tracking-widest transition-colors',
              mode === 'scroll' ? 'border-primary/60 bg-primary/15 text-primary' : 'border-border/70 text-muted-foreground',
            )}
          >
            <ScrollText className="h-3 w-3" /> SCROLL
          </button>
          <button
            type="button"
            onClick={() => setMode('log')}
            aria-label={LABELS.LOG_MODE}
            className={cn(
              'clip-corner-sm flex items-center gap-1 border px-2 py-0.5 font-mono text-[9px] tracking-widest transition-colors',
              mode === 'log' ? 'border-primary/60 bg-primary/15 text-primary' : 'border-border/70 text-muted-foreground',
            )}
          >
            <List className="h-3 w-3" /> LOG
          </button>
        </div>
      </div>

      {mode === 'log' ? (
        /* Full-stream readout: every line rendered, active line highlighted.
           Scrollable, and the active line is kept in view (long lyrics used to be
           clipped with no way to scroll). */
        <div className="relative min-h-0 flex-1 px-3 py-2">
          <div ref={logRef} className="thin-scrollbar h-full overflow-y-auto pr-1">
          <div className="flex flex-col">
            {lines.map((line, i) => {
              const active = i === activeIdx;
              return (
                <div
                  key={`${i}-${line.time}`}
                  data-log-line={i}
                  className={cn(
                    'flex items-center gap-2 border-l-2 py-[3px] pl-2 transition-colors',
                    active ? 'border-primary bg-primary/10' : 'border-transparent',
                  )}
                >
                  <span className={cn('shrink-0 font-mono text-[8px] tracking-widest', active ? 'text-primary' : 'text-foreground/20')}>
                    {String(Math.floor(line.time / 60)).padStart(2, '0')}:
                    {String(Math.floor(line.time % 60)).padStart(2, '0')}
                  </span>
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate font-mono text-[12px] leading-snug',
                      active ? 'font-bold text-foreground' : 'text-foreground/50',
                    )}
                  >
                    {line.text || '\u00A0'}
                  </span>
                </div>
              );
            })}
          </div>
          </div>
          <div aria-hidden className="pointer-events-none absolute inset-x-3 top-0 h-10 bg-gradient-to-b from-background to-transparent" />
          <div aria-hidden className="pointer-events-none absolute inset-x-3 bottom-0 h-10 bg-gradient-to-t from-background to-transparent" />
        </div>
      ) : (
        <div
          ref={scrollerRef}
          className="no-scrollbar relative min-h-0 flex-1 overflow-y-auto px-6 pb-16 pt-[42%] scroll-smooth"
        >
          <div className="flex flex-col gap-1">
            {lines.map((line, i) => {
              const active = i === activeIdx;
              return (
                <div
                  key={`${i}-${line.time}`}
                  ref={active ? activeLineRef : undefined}
                  className="flex items-baseline gap-2"
                >
                  <span
                    className={cn(
                      'shrink-0 font-mono text-[8px] tracking-widest transition-colors',
                      active ? 'text-primary' : 'text-foreground/20',
                    )}
                  >
                    {String(Math.floor(line.time / 60)).padStart(2, '0')}:
                    {String(Math.floor(line.time % 60)).padStart(2, '0')}
                  </span>
                  <p
                    className={cn(
                      'min-w-0 flex-1 py-1.5 text-[15px] leading-snug transition-colors duration-200',
                      active ? 'font-bold text-accent' : 'font-normal text-foreground/45',
                    )}
                  >
                    {line.text || '\u00A0'}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
