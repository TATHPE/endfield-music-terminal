// EXPORTS: PlaylistAddSheet
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Plus } from 'lucide-react';
import { usePlayer } from '@/lib/player-context';
import { FAVORITES_ID } from '@/lib/playlists';
import { cn } from '@/lib/utils';

interface PlaylistAddSheetProps {
  open: boolean;
  songId: string | null;
  onClose: () => void;
}

/** Pick a playlist (or create a new one) to add the given song to. */
export default function PlaylistAddSheet({ open, songId, onClose }: PlaylistAddSheetProps) {
  const { playlists, addToPlaylist, createPlaylist } = usePlayer();
  const [draft, setDraft] = useState('');

  const custom = playlists.filter((p) => p.id !== FAVORITES_ID);

  const submit = () => {
    const name = draft.trim();
    if (!name) return;
    const id = createPlaylist(name);
    if (songId) addToPlaylist(id, songId);
    setDraft('');
    onClose();
  };

  return (
    <AnimatePresence>
      {open && songId && (
        <>
          <motion.div
            key="sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/70"
            aria-hidden
          />
          <motion.div
            key="sheet-body"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 340 }}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[430px]"
            role="dialog"
            aria-label="加入歌单"
          >
            <div className="clip-corner relative border-t border-primary/40 bg-card p-4">
              <p className="font-mono text-[9px] tracking-[0.28em] text-primary">
                ASSIGN TRACK // PLAYLIST
              </p>
              <h2 className="mt-0.5 text-lg font-bold tracking-wide text-foreground">加入歌单</h2>

              {/* create inline */}
              <div className="mt-4 flex items-center gap-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submit();
                  }}
                  placeholder="新建歌单名称…"
                  maxLength={32}
                  className="clip-corner-sm min-w-0 flex-1 border border-border bg-secondary px-3 py-2 font-mono text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary"
                />
                <button
                  type="button"
                  onClick={submit}
                  disabled={!draft.trim()}
                  aria-label="新建歌单"
                  className="clip-corner-sm flex h-9 w-9 shrink-0 items-center justify-center bg-primary text-primary-foreground transition-transform active:scale-95 disabled:opacity-40"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {/* existing playlists */}
              <div className="mt-3 flex max-h-56 flex-col gap-1 overflow-y-auto">
                {custom.length === 0 ? (
                  <p className="py-4 text-center font-mono text-[11px] tracking-widest text-muted-foreground/60">
                    暂无自定义歌单 — 输入名称创建一个
                  </p>
                ) : (
                  custom.map((pl) => {
                    const has = pl.songIds.includes(songId);
                    return (
                      <button
                        key={pl.id}
                        type="button"
                        onClick={() => {
                          if (!has) addToPlaylist(pl.id, songId);
                          onClose();
                        }}
                        className={cn(
                          'flex items-center justify-between gap-2 border-l-2 px-3 py-2 text-left transition-colors',
                          has
                            ? 'border-primary bg-primary/[0.06]'
                            : 'border-transparent hover:bg-card/80',
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-foreground">{pl.name}</span>
                          <span className="block font-mono text-[9px] tracking-widest text-muted-foreground">
                            {pl.songIds.length} TRACKS
                          </span>
                        </span>
                        {has && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
