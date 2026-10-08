// EXPORTS: QueuePanel
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, ListX, Play } from 'lucide-react';
import { usePlayer } from '@/lib/player-context';
import { formatTime } from '@/lib/music';
import { cn } from '@/lib/utils';
import CoverArt from '@/components/player/CoverArt';
import EqBars from '@/components/player/EqBars';

interface QueuePanelProps {
  open: boolean;
  onClose: () => void;
}

/** Slide-up queue readout for the current playback context. */
export default function QueuePanel({ open, onClose }: QueuePanelProps) {
  const { queue, currentId, playSong, removeFromQueue, activeQueueId, playlists, saveQueueSnapshot } = usePlayer();

  const activeName =
    activeQueueId === null
      ? '全部曲目'
      : playlists.find((p) => p.id === activeQueueId)?.name ?? '未知清单';

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="queue-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 z-[80] bg-black/70"
            aria-hidden
          />
          <motion.div
            key="queue-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 340 }}
            className="fixed inset-x-0 bottom-0 z-[90] mx-auto max-w-[430px]"
            role="dialog"
            aria-label="播放队列"
          >
            <div className="clip-corner relative flex max-h-[72vh] flex-col border-t border-primary/40 bg-card">
              {/* header */}
              <div className="flex items-center justify-between border-b border-border/80 px-4 py-3">
                <div>
                  <p className="font-mono text-[9px] tracking-[0.28em] text-primary">
                    ACTIVE QUEUE // {activeQueueId === null ? 'LIBRARY NODE' : 'SEQUENCE NODE'}
                  </p>
                  <h2 className="mt-0.5 text-lg font-bold tracking-wide text-foreground">{activeName}</h2>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => saveQueueSnapshot()}
                    className="clip-corner-sm flex items-center gap-1.5 border border-border bg-secondary px-2.5 py-1.5 font-mono text-[10px] tracking-widest text-muted-foreground transition-colors hover:text-primary"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    SAVE SNAPSHOT
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="关闭队列"
                    className="clip-corner-sm flex items-center gap-1.5 border border-border bg-secondary px-2.5 py-1.5 font-mono text-[10px] tracking-widest text-muted-foreground transition-colors hover:text-foreground"
                  >
                    CLOSE
                  </button>
                </div>
              </div>

              {/* body */}
              {queue.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-14 text-center">
                  <ListX className="h-8 w-8 text-muted-foreground/40" strokeWidth={1.4} />
                  <p className="font-mono text-xs tracking-widest text-muted-foreground/70">
                    队列为空 — 请先导入曲目
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col gap-0.5 overflow-y-auto px-2 py-2">
                  {queue.map((song, i) => {
                    const current = song.id === currentId;
                    return (
                      <li key={song.id} className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => playSong(song.id)}
                          aria-label={`播放 ${song.title}`}
                          className={cn(
                            'flex min-w-0 flex-1 items-center gap-2.5 border-l-2 px-2 py-1.5 text-left transition-colors',
                            current
                              ? 'border-primary bg-primary/[0.07]'
                              : 'border-transparent hover:bg-card/80',
                          )}
                        >
                          <span className="w-5 shrink-0 text-center font-mono text-[10px] text-muted-foreground">
                            {current ? (
                              <span className="flex justify-center">
                                <EqBars className="h-2" />
                              </span>
                            ) : (
                              String(i + 1).padStart(2, '0')
                            )}
                          </span>
                          <CoverArt cover={song.cover} title={song.title} artist={song.artist} deviceAlbumId={song.deviceAlbumId} devicePath={song.devicePath} className="h-9 w-9" />
                          <span className="min-w-0 flex-1">
                            <span
                              className={cn(
                                'block truncate text-[13px]',
                                current ? 'font-semibold text-primary' : 'text-foreground/90',
                              )}
                            >
                              {song.title}
                            </span>
                            <span className="block truncate font-mono text-[9px] tracking-wide text-muted-foreground">
                              {song.artist}
                            </span>
                          </span>
                          <span className="shrink-0 font-mono text-[9px] text-muted-foreground">
                            {song.duration > 0 ? formatTime(song.duration) : '--:--'}
                          </span>
                          {current && <Play className="h-3 w-3 shrink-0 text-primary" aria-hidden />}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeFromQueue(song.id)}
                          aria-label={`从队列移除 ${song.title}`}
                          className="shrink-0 p-1.5 text-muted-foreground/40 transition-colors hover:text-destructive"
                        >
                          <ListX className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
