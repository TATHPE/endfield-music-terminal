import { motion } from 'framer-motion';
import { Pause, Play, SkipForward } from 'lucide-react';
import { usePlayer } from '@/lib/player-context';
import { formatTime } from '@/lib/music';
import CoverArt from '@/components/player/CoverArt';
import EqBars from '@/components/player/EqBars';

interface MiniPlayerProps {
  onOpen: () => void;
}

/**
 * Narrow terminal status bar replacing the frosted capsule: straight cut
 * corners, hairline separators and a segment readout — ENDFIELD OS vehicle
 * deck chrome. Tap opens the full AUDIO OUTPUT panel.
 */
export default function MiniPlayer({ onOpen }: MiniPlayerProps) {
  const { currentSong, isPlaying, togglePlay, playNext, currentTime, duration } = usePlayer();

  if (!currentSong) return null;

  const ratio = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  return (
    <motion.div
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 40, opacity: 0 }}
      transition={{ type: 'spring', damping: 30, stiffness: 320 }}
      className="clip-corner relative z-20 mx-3 overflow-hidden border backdrop-blur-2xl"
      style={{
        background: 'var(--glass-bg)',
        borderColor: 'var(--glass-border)',
        boxShadow: 'var(--glass-shadow)',
      }}
    >
      {/* segment progress header */}
      <div aria-hidden className="flex h-1.5 w-full gap-[1px] bg-foreground/8">
        {Array.from({ length: 26 }, (_, i) => (
          <span
            key={i}
            className="flex-1"
            style={{ background: (i + 1) / 26 <= ratio ? 'var(--primary)' : 'transparent' }}
          />
        ))}
      </div>
      <div className="flex items-center gap-3 border-t border-foreground/10 px-3 py-2">
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-label="打开音频输出"
        >
          <CoverArt cover={currentSong.cover} title={currentSong.title} artist={currentSong.artist} deviceAlbumId={currentSong.deviceAlbumId} devicePath={currentSong.devicePath} className="h-9 w-9" />
          <div className="min-w-0">
            <p className="truncate font-mono text-[11px] font-semibold tracking-wider text-foreground">
              NOW PLAYING // <span className="text-primary">{currentSong.title}</span>
            </p>
            <p className="truncate font-mono text-[9px] tracking-widest text-muted-foreground">
              {currentSong.artist} · {formatTime(currentTime)} / {formatTime(duration)}
            </p>
          </div>
          {isPlaying && <EqBars className="ml-auto hidden shrink-0 pr-1 sm:flex" />}
        </button>
        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? '暂停' : '播放'}
          className="clip-corner-sm flex h-9 w-9 shrink-0 items-center justify-center border border-primary/50 bg-primary/10 text-primary transition-colors active:scale-90"
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-[1px]" />}
        </button>
        <button
          type="button"
          onClick={playNext}
          aria-label="下一首"
          className="flex h-9 w-8 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-primary active:scale-90"
        >
          <SkipForward className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  );
}
