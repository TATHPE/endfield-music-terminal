import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ListOrdered,
  Music,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { usePlayer } from '@/lib/player-context';
import { formatClock, formatCodec, formatTime } from '@/lib/music';
import { cn } from '@/lib/utils';
import CoverArt from '@/components/player/CoverArt';
import CornerFrame from '@/components/player/CornerFrame';
import HazardStrip from '@/components/player/HazardStrip';
import ProgressBar from '@/components/player/ProgressBar';
import LyricsView from '@/components/player/LyricsView';
import QueuePanel from '@/components/player/QueuePanel';

const MODE_META = {
  sequence: { label: '顺序循环', Icon: Repeat },
  shuffle: { label: '随机播放', Icon: Shuffle },
  'repeat-one': { label: '单曲循环', Icon: Repeat1 },
} as const;

type Panel = 'artwork' | 'lyrics';

/** Now-playing view: big artwork / synced lyrics, terminal readouts, transport. */
export default function NowPlayingView() {
  const {
    currentSong,
    songs,
    isPlaying,
    mode,
    currentTime,
    duration,
    togglePlay,
    playNext,
    playPrev,
    seek,
    cycleMode,
    volume,
    muted,
    setVolume,
    toggleMute,
  } = usePlayer();
  const [panel, setPanel] = useState<Panel>('artwork');
  const [queueOpen, setQueueOpen] = useState(false);

  if (!currentSong) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 px-6 py-20 text-center">
        <div aria-hidden className="hazard-stripe h-1 w-24 opacity-70" />
        <Music className="h-10 w-10 text-primary/70" strokeWidth={1.4} />
        <p className="text-base font-semibold text-foreground">没有正在播放的曲目</p>
        <p className="font-mono text-[11px] tracking-widest text-muted-foreground">
          前往曲库导入本地音频并选择曲目开始播放
        </p>
      </div>
    );
  }

  const song = currentSong;
  const idx = songs.findIndex((s) => s.id === song.id);
  const trackNo = idx >= 0 ? idx + 1 : '--';
  const { Icon: ModeIcon, label: modeLabel } = MODE_META[mode];
  const mutedShown = muted || volume <= 0.005;

  return (
    <div className="flex flex-col gap-4 px-4 pb-8 pt-4">
      {/* Header */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.28em] text-primary">
            AUDIO TERMINAL // NOW PLAYING
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-wide text-foreground">正在播放</h1>
        </div>
        <button
          type="button"
          onClick={() => setQueueOpen(true)}
          aria-label="打开播放队列"
          className="clip-corner-sm mt-1 flex shrink-0 items-center gap-1.5 border border-border bg-secondary px-2.5 py-1.5 font-mono text-[10px] tracking-widest text-muted-foreground transition-colors hover:text-primary"
        >
          <ListOrdered className="h-3.5 w-3.5" />
          QUEUE
        </button>
      </header>

      {/* Panel switch */}
      <div className="flex items-center gap-1 border border-border bg-secondary/60 p-0.5">
        {(
          [
            { id: 'artwork', label: 'ARTWORK' },
            { id: 'lyrics', label: 'LYRICS' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setPanel(t.id)}
            className={cn(
              'clip-corner-sm flex-1 py-1.5 font-mono text-[10px] tracking-[0.2em] transition-colors',
              panel === t.id
                ? 'bg-primary font-bold text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Artwork / lyrics area */}
      <div className="relative min-h-[210px] overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          {panel === 'artwork' ? (
            <motion.div
              key="artwork"
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 14 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="relative mx-auto w-full max-w-[300px]"
            >
              <CornerFrame size="h-5 w-5" className="opacity-90" />
              <CoverArt
                cover={song.cover}
                title={song.title}
                framed
                playing={isPlaying}
                className="aspect-square w-full"
              />
              <div aria-hidden className="absolute inset-x-1 bottom-1">
                <HazardStrip className="h-[4px] opacity-80" />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="lyrics"
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -14 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="absolute inset-0"
            >
              <LyricsView className="h-full" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Terminal readouts */}
      <div className="flex items-center justify-between border-y border-border/80 py-2 font-mono text-[10px] tracking-[0.14em] text-muted-foreground">
        <span>
          TRACK <b className="ml-1 text-primary">{trackNo}</b>
          <span className="text-foreground/40">/{songs.length}</span>
        </span>
        <span>{formatCodec(song.codec)}</span>
        <span>{song.sampleRate > 0 ? `${(song.sampleRate / 1000).toFixed(1)}kHz` : '--kHz'}</span>
        <span>{song.bitrate > 0 ? `${song.bitrate}kbps` : '--kbps'}</span>
      </div>

      {/* Title block */}
      <div className="text-center">
        <h2 className="text-2xl font-bold tracking-wide text-foreground">{song.title}</h2>
        <p className="mt-1.5 font-mono text-[11px] tracking-widest text-muted-foreground">
          {song.artist} · {song.album}
        </p>
      </div>

      {/* Progress */}
      <div>
        <ProgressBar value={currentTime} max={duration} onSeek={seek} disabled={duration <= 0} playing={isPlaying} />
        <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] tracking-widest">
          <span className="text-primary">{formatTime(currentTime)}</span>
          <span className="text-muted-foreground">{formatClock(duration)}</span>
        </div>
      </div>

      {/* Transport */}
      <div className="flex items-center justify-between gap-2">
        <motion.button
          type="button"
          onClick={cycleMode}
          aria-label={`播放模式：${modeLabel}`}
          title={modeLabel}
          whileTap={{ scale: 0.82, rotate: -12 }}
          transition={{ type: 'spring', stiffness: 500, damping: 22 }}
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center transition-colors',
            mode === 'sequence' ? 'text-muted-foreground hover:text-primary' : 'text-primary',
          )}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={mode}
              initial={{ scale: 0.5, opacity: 0, rotate: -90 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.5, opacity: 0, rotate: 90 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="flex items-center justify-center"
            >
              <ModeIcon className="h-5 w-5" strokeWidth={2.2} />
            </motion.span>
          </AnimatePresence>
        </motion.button>

        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={playPrev}
            aria-label="上一首"
            className="flex h-11 w-11 items-center justify-center text-foreground transition-colors hover:text-primary active:scale-90"
          >
            <SkipBack className="h-6 w-6" />
          </button>
          <motion.button
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? '暂停' : '播放'}
            whileTap={{ scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
            className="clip-corner-lg flex h-16 w-16 items-center justify-center bg-primary text-primary-foreground shadow-[0_0_24px_rgba(242,194,0,0.22)]"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={isPlaying ? 'pause' : 'play'}
                initial={{ scale: 0.6, opacity: 0, rotate: -12 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={{ scale: 0.6, opacity: 0, rotate: 12 }}
                transition={{ duration: 0.16 }}
                className="flex items-center justify-center"
              >
                {isPlaying ? <Pause className="h-8 w-8" /> : <Play className="h-8 w-8 translate-x-[2px]" />}
              </motion.span>
            </AnimatePresence>
          </motion.button>
          <button
            type="button"
            onClick={playNext}
            aria-label="下一首"
            className="flex h-11 w-11 items-center justify-center text-foreground transition-colors hover:text-primary active:scale-90"
          >
            <SkipForward className="h-6 w-6" />
          </button>
        </div>

        <div className="flex w-10 shrink-0 items-center justify-center">
          <button
            type="button"
            onClick={toggleMute}
            aria-label={mutedShown ? '取消静音' : '静音'}
            className={cn(
              'flex items-center justify-center transition-colors',
              mutedShown ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {mutedShown ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Volume */}
      <div className="flex items-center gap-3 px-1">
        <span className="font-mono text-[9px] tracking-[0.2em] text-muted-foreground">VOL</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.02}
          value={muted ? 0 : volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          aria-label="音量"
          className="h-1.5 w-full cursor-pointer"
        />
        <span className="w-9 text-right font-mono text-[10px] text-muted-foreground">
          {Math.round((muted ? 0 : volume) * 100)}%
        </span>
      </div>

      <QueuePanel open={queueOpen} onClose={() => setQueueOpen(false)} />
    </div>
  );
}
