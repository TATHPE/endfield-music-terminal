import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
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
import SpectrumBars from '@/components/player/SpectrumBars';

const MODE_META = {
  sequence: { label: '序列循环', Icon: Repeat },
  shuffle: { label: '无序序列', Icon: Shuffle },
  'repeat-one': { label: '单介质循环', Icon: Repeat1 },
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
    spectrum,
    spectrumOn,
    setSpectrumOn,
  } = usePlayer();
  const [panel, setPanel] = useState<Panel>('artwork');
  const [queueOpen, setQueueOpen] = useState(false);
  const coverWrapRef = useRef<HTMLDivElement>(null);
  const [coverSize, setCoverSize] = useState(0);

  /* Square artwork: measure the flex area and clamp to min(width, height),
     so the artwork is always a perfect square and never cropped by the
     layout no matter what height is available above the dock. */
  useEffect(() => {
    const el = coverWrapRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setCoverSize(Math.max(0, Math.floor(Math.min(r.width, r.height))));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
    /* Fixed layout: the page never scrolls; content lives strictly above
       the dock (outer bottom padding), nothing is ever covered. */
    <div className="flex h-full flex-col overflow-hidden px-4 pb-4 pt-3">
      {/* Header */}
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.28em] text-primary">
            AUDIO TERMINAL // OUTPUT STREAM [AUD-03]
          </p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-wide text-foreground">音频输出</h1>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSpectrumOn(!spectrumOn)}
            aria-label={spectrumOn ? '关闭频谱' : '开启频谱'}
            title="频谱可视化"
            className={cn(
              'clip-corner-sm flex shrink-0 items-center gap-1.5 border px-2.5 py-1.5 font-mono text-[10px] tracking-widest transition-colors',
              spectrumOn
                ? 'border-primary/60 bg-primary/10 text-primary'
                : 'border-border bg-secondary text-muted-foreground hover:text-primary',
            )}
          >
            <Activity className="h-3.5 w-3.5" />
            SPECTRUM
          </button>
          <button
            type="button"
            onClick={() => setQueueOpen(true)}
            aria-label="打开播放队列"
            className="clip-corner-sm flex shrink-0 items-center gap-1.5 border border-border bg-secondary px-2.5 py-1.5 font-mono text-[10px] tracking-widest text-muted-foreground transition-colors hover:text-primary"
          >
            <ListOrdered className="h-3.5 w-3.5" />
            QUEUE
          </button>
        </div>
      </header>

      {/* Panel switch */}
      <div className="mt-2 flex items-center gap-1 border border-border bg-secondary/60 p-0.5">
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

      {/* Artwork / lyrics: square artwork fully visible, sized to the area */}
      <div ref={coverWrapRef} className="relative mt-2 min-h-0 flex-1 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          {panel === 'artwork' ? (
            <motion.div
              key="artwork"
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 14 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="relative flex h-full w-full items-center justify-center"
            >
              {coverSize > 0 && (
                <div
                  className="relative shrink-0"
                  style={{ width: coverSize, height: coverSize }}
                >
                  <CornerFrame size="h-5 w-5" className="opacity-90" />
                  <CoverArt
                    cover={song.cover}
                    title={song.title}
                    artist={song.artist}
                    framed
                    playing={isPlaying}
                    deviceAlbumId={song.deviceAlbumId}
                    devicePath={song.devicePath}
                    className="aspect-square w-full"
                  />
                  <div aria-hidden className="absolute inset-x-1 bottom-1">
                    <HazardStrip className="h-[4px] opacity-80" />
                  </div>
                </div>
              )}
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

      {/* Live spectrum readout (optional) */}
      {spectrumOn && (
        <div className="mt-1.5 flex items-center gap-2 border-y border-border/60 py-1">
          <span className="shrink-0 font-mono text-[8px] tracking-[0.2em] text-muted-foreground">
            SPECTRUM
          </span>
          <SpectrumBars data={spectrum} />
        </div>
      )}

      {/* Track info: uniform four-column mono readout */}
      <div className="mt-2 grid grid-cols-4 gap-1 border-y border-border/80 py-1.5 text-center font-mono text-[10px] tracking-[0.14em] text-muted-foreground">
        <span>
          TRACK <b className="text-primary">{trackNo}</b>
          <span className="text-foreground/40">/{songs.length}</span>
        </span>
        <span>{formatCodec(song.codec)}</span>
        <span>{song.sampleRate > 0 ? `${(song.sampleRate / 1000).toFixed(1)}kHz` : '--kHz'}</span>
        <span>{song.bitrate > 0 ? `${song.bitrate}kbps` : '--kbps'}</span>
      </div>

      {/* Title */}
      <div className="mt-1.5 text-center">
        <h2 className="truncate text-[15px] font-bold leading-tight tracking-wide text-foreground">{song.title}</h2>
        <p className="mt-0.5 truncate font-mono text-[10px] tracking-widest text-muted-foreground">
          {song.artist} · {song.album}
        </p>
      </div>

      {/* Progress */}
      <div className="mt-1">
        <ProgressBar value={currentTime} max={duration} onSeek={seek} disabled={duration <= 0} playing={isPlaying} />
        <div className="mt-1 flex items-center justify-between font-mono text-[10px] tracking-widest">
          <span className="text-primary">{formatTime(currentTime)}</span>
          <span className="text-muted-foreground">{formatClock(duration)}</span>
        </div>
      </div>

      {/* Transport: uniform 44px controls + prominent play key.
          NOTE: icons render statically (no framer-motion transform/opacity) —
          old WebView kernels on OriginOS 3 leave the animated icon stuck at
          opacity 0 / a broken transform, making the play key look like a bare
          solid block covered by the theme color. Plain CSS transitions only. */}
      <div className="mt-1 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={cycleMode}
          aria-label={`播放模式：${modeLabel}`}
          title={modeLabel}
          className={cn(
            'clip-corner-sm flex h-11 w-11 shrink-0 items-center justify-center border transition-colors active:scale-90',
            mode === 'sequence'
              ? 'border-border bg-card/60 text-muted-foreground hover:text-primary'
              : 'border-primary/50 bg-primary/10 text-primary',
          )}
        >
          <ModeIcon className="h-[22px] w-[22px]" strokeWidth={2.2} />
        </button>

        <button
          type="button"
          onClick={playPrev}
          aria-label="上一首"
          className="clip-corner-sm flex h-11 w-11 items-center justify-center border border-border bg-card/60 text-foreground transition-colors hover:text-primary active:scale-90"
        >
          <SkipBack className="h-[22px] w-[22px]" />
        </button>

        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? '暂停' : '播放'}
          className="clip-corner-lg mx-1 flex h-14 w-14 items-center justify-center bg-primary text-primary-foreground shadow-[0_0_24px_rgba(242,194,0,0.22)] transition-transform active:scale-90"
        >
          {isPlaying ? <Pause className="h-7 w-7" /> : <Play className="h-7 w-7 translate-x-[2px]" />}
        </button>

        <button
          type="button"
          onClick={playNext}
          aria-label="下一首"
          className="clip-corner-sm flex h-11 w-11 items-center justify-center border border-border bg-card/60 text-foreground transition-colors hover:text-primary active:scale-90"
        >
          <SkipForward className="h-[22px] w-[22px]" />
        </button>

        <button
          type="button"
          onClick={toggleMute}
          aria-label={mutedShown ? '取消静音' : '静音'}
          className={cn(
            'clip-corner-sm flex h-11 w-11 items-center justify-center border transition-colors',
            mutedShown
              ? 'border-primary/50 bg-primary/10 text-primary'
              : 'border-border bg-card/60 text-muted-foreground hover:text-primary',
          )}
        >
          {mutedShown ? <VolumeX className="h-[22px] w-[22px]" /> : <Volume2 className="h-[22px] w-[22px]" />}
        </button>
      </div>

      {/* Volume */}
      <div className="mt-1 flex items-center gap-3 px-1">
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
