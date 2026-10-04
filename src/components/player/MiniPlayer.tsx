import { motion } from 'framer-motion';
import { Pause, Play, SkipForward } from 'lucide-react';
import { usePlayer } from '@/lib/player-context';
import { formatTime } from '@/lib/music';
import CoverArt from '@/components/player/CoverArt';
import EqBars from '@/components/player/EqBars';

interface MiniPlayerProps {
  onOpen: () => void;
}

/** Docked mini player shown above the bottom nav. Parent owns the AnimatePresence. */
export default function MiniPlayer({ onOpen }: MiniPlayerProps) {
  const { currentSong, isPlaying, togglePlay, playNext, currentTime, duration } = usePlayer();

  if (!currentSong) return null;

  const ratio = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  return (
    <motion.div
      initial={{ y: 56, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 56, opacity: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 300 }}
      className="relative z-20 shrink-0 border-t border-border/80 bg-card/90 backdrop-blur"
    >
        <div aria-hidden className="h-[3px] w-full bg-foreground/10">
          <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${ratio * 100}%` }} />
        </div>
        <div className="flex items-center gap-3 px-3 py-2">
          <button
            type="button"
            onClick={onOpen}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
            aria-label="打开正在播放"
          >
            <CoverArt cover={currentSong.cover} title={currentSong.title} className="h-10 w-10" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{currentSong.title}</p>
              <p className="truncate font-mono text-[10px] tracking-wider text-muted-foreground">
                {currentSong.artist} · {formatTime(currentTime)} / {formatTime(duration)}
              </p>
            </div>
            {isPlaying && <EqBars className="ml-auto hidden shrink-0 pr-1 sm:flex" />}
          </button>
          <motion.button
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? '暂停' : '播放'}
            whileTap={{ scale: 0.85 }}
            transition={{ type: 'spring', stiffness: 500, damping: 22 }}
            className="clip-corner-sm flex h-10 w-10 shrink-0 items-center justify-center border border-primary/50 bg-primary/10 text-primary transition-colors hover:bg-primary/20"
          >
            {isPlaying ? <Pause className="h-4.5 w-4.5" /> : <Play className="h-4.5 w-4.5 translate-x-[1px]" />}
          </motion.button>
          <button
            type="button"
            onClick={playNext}
            aria-label="下一首"
            className="flex h-10 w-9 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-primary active:scale-90"
          >
            <SkipForward className="h-4.5 w-4.5" />
          </button>
        </div>
      </motion.div>
  );
}
