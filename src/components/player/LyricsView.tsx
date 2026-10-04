// EXPORTS: LyricsView
import { useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { parseLrc, type LrcLine } from '@/lib/lyrics';
import { usePlayer } from '@/lib/player-context';
import { cn } from '@/lib/utils';

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

/** Synchronized scrolling lyrics in terminal style. */
export default function LyricsView({ className = '' }: LyricsViewProps) {
  const { currentSong, currentTime } = usePlayer();
  const parsed = useMemo(() => parseLrc(currentSong?.lyrics ?? ''), [currentSong?.lyrics]);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const activeLineRef = useRef<HTMLDivElement | null>(null);
  const lastIdxRef = useRef(-1);

  // Derived from render: the active line is a pure function of currentTime.
  const activeIdx = parsed?.kind === 'timed' ? findActive(parsed.lines, currentTime) : -1;

  // Reset scroll tracking when the track / lyric shape changes.
  useEffect(() => {
    lastIdxRef.current = -1;
    const scroller = scrollerRef.current;
    if (scroller) scroller.scrollTop = 0;
  }, [currentSong?.id, parsed?.kind]);

  // Keep the active line centered inside the scroll container (only on index change).
  useEffect(() => {
    if (activeIdx === lastIdxRef.current) return;
    lastIdxRef.current = activeIdx;
    const scroller = scrollerRef.current;
    const el = activeLineRef.current;
    if (!scroller || !el) return;
    const target = el.offsetTop - scroller.clientHeight / 2 + el.clientHeight / 2;
    scroller.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  }, [activeIdx]);

  if (!currentSong) {
    return (
      <div className={cn('flex flex-col items-center justify-center gap-3 py-16 text-center', className)}>
        <span className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground">
          LYRICS STREAM // OFFLINE
        </span>
        <p className="font-mono text-sm text-muted-foreground/70">NO ACTIVE TRACK</p>
      </div>
    );
  }

  if (!parsed) {
    return (
      <div className={cn('flex flex-col items-center justify-center gap-3 py-16 text-center', className)}>
        <span className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground">
          LYRICS STREAM // OFFLINE
        </span>
        <p className="font-mono text-sm text-muted-foreground/70">NO LYRICS DATA</p>
        <p className="px-10 font-mono text-[11px] leading-relaxed tracking-wider text-muted-foreground/50">
          音频标签中未检测到歌词
        </p>
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

  return (
    <div
      ref={scrollerRef}
      className={cn(
        'no-scrollbar relative h-full overflow-y-auto px-6 pb-16 pt-[42%] scroll-smooth',
        className,
      )}
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
              <motion.p
                animate={{
                  color: active ? 'var(--accent)' : 'rgba(241,240,234,0.42)',
                  scale: active ? 1.06 : 1,
                  x: active ? 4 : 0,
                }}
                transition={{ duration: 0.28, ease: 'easeOut' }}
                className={cn(
                  'min-w-0 flex-1 py-1.5 text-[15px] leading-snug transition-colors',
                  active ? 'font-bold' : 'font-normal',
                )}
              >
                {line.text || '\u00A0'}
              </motion.p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
