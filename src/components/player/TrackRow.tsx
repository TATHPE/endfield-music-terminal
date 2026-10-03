import { Trash2 } from 'lucide-react';
import type { ISong } from '@/lib/music';
import { formatTime } from '@/lib/music';
import { cn } from '@/lib/utils';
import CoverArt from '@/components/player/CoverArt';
import EqBars from '@/components/player/EqBars';

interface TrackRowProps {
  song: ISong;
  index: number;
  isCurrent: boolean;
  onPlay: () => void;
  onRemove: () => void;
}

/** One library row: index readout, artwork, meta, duration, remove. */
export default function TrackRow({ song, index, isCurrent, onPlay, onRemove }: TrackRowProps) {
  return (
    <li>
      <div
        className={cn(
          'group flex items-center gap-3 border-l-2 bg-card/60 px-2.5 py-2 transition-colors',
          isCurrent ? 'border-primary bg-primary/[0.06]' : 'border-transparent hover:bg-card',
        )}
      >
        <button
          type="button"
          onClick={onPlay}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-label={`播放 ${song.title}`}
        >
          <span className="w-6 shrink-0 text-center font-mono text-[11px] text-muted-foreground">
            {isCurrent ? (
              <span className="flex justify-center">
                <EqBars className="h-2.5" />
              </span>
            ) : (
              String(index + 1).padStart(2, '0')
            )}
          </span>
          <CoverArt cover={song.cover} title={song.title} className="h-11 w-11" />
          <span className="min-w-0 flex-1">
            <span className={cn('block truncate text-sm', isCurrent ? 'font-semibold text-primary' : 'font-medium text-foreground')}>
              {song.title}
            </span>
            <span className="block truncate font-mono text-[10px] tracking-wide text-muted-foreground">
              {song.artist} · {song.album}
            </span>
          </span>
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
            {song.duration > 0 ? formatTime(song.duration) : '--:--'}
          </span>
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`移除 ${song.title}`}
          className="shrink-0 p-1.5 text-muted-foreground/50 transition-colors hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}
