// EXPORTS: PlaylistsView
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Heart, ListPlus, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { usePlayer } from '@/lib/player-context';
import { FAVORITES_ID } from '@/lib/playlists';
import { formatTime } from '@/lib/music';
import type { ISong } from '@/lib/music';
import type { Playlist } from '@/lib/playlists';
import { cn } from '@/lib/utils';
import CoverArt from '@/components/player/CoverArt';
import EqBars from '@/components/player/EqBars';

interface PlaylistCardProps {
  pl: Playlist;
  songs: ISong[];
  currentId: string | null;
  activeQueueId: string | null;
  expanded: string | null;
  onToggleExpand: (id: string) => void;
  onPlaySong: (id: string) => void;
  onPlayPlaylist: (id: string) => void;
  onDeletePlaylist: (id: string) => void;
  onRenamePlaylist: (id: string, name: string) => void;
  onRemoveFromPlaylist: (playlistId: string, songId: string) => void;
  onToggleFavorite: (id: string) => void;
}

function PlaylistCard({
  pl,
  songs,
  currentId,
  activeQueueId,
  expanded,
  onToggleExpand,
  onPlaySong,
  onPlayPlaylist,
  onDeletePlaylist,
  onRenamePlaylist,
  onRemoveFromPlaylist,
  onToggleFavorite,
}: PlaylistCardProps) {
  const isFav = pl.id === FAVORITES_ID;
  const isOpen = expanded === pl.id;
  const tracks = pl.songIds
    .map((id) => songs.find((s) => s.id === id))
    .filter((s): s is ISong => Boolean(s));
  const isActiveContext = activeQueueId === pl.id;
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(pl.name);

  const commitRename = () => {
    const next = nameDraft.trim();
    if (next && next !== pl.name) onRenamePlaylist(pl.id, next);
    setRenaming(false);
  };

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'border-l-2 bg-card/60 transition-colors',
        isActiveContext ? 'border-primary' : 'border-transparent',
      )}
    >
      {renaming ? (
        <div className="flex items-center gap-2 px-3 py-2.5">
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') {
                setNameDraft(pl.name);
                setRenaming(false);
              }
            }}
            maxLength={32}
            aria-label={`重命名播放序列 ${pl.name}`}
            className="clip-corner-sm min-w-0 flex-1 border border-primary/60 bg-secondary px-2 py-1.5 font-mono text-[12px] text-foreground outline-none"
          />
          <button
            type="button"
            onClick={commitRename}
            aria-label="确认重命名"
            className="clip-corner-sm flex h-9 w-9 shrink-0 items-center justify-center bg-primary text-primary-foreground transition-transform active:scale-95"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setNameDraft(pl.name);
              setRenaming(false);
            }}
            aria-label="取消重命名"
            className="shrink-0 p-1.5 font-mono text-base leading-none text-muted-foreground transition-colors hover:text-foreground"
          >
            ×
          </button>
        </div>
      ) : (
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => onToggleExpand(pl.id)}
          aria-label={`展开播放序列 ${pl.name}`}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span
            className={cn(
              'clip-corner-sm flex h-10 w-10 shrink-0 items-center justify-center',
              isFav
                ? 'bg-primary/15 text-primary'
                : 'border border-border bg-secondary text-muted-foreground',
            )}
          >
            {isFav ? <Heart className="h-4.5 w-4.5" /> : <ListPlus className="h-4.5 w-4.5" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-foreground">{pl.name}</span>
            <span className="block font-mono text-[9px] tracking-widest text-muted-foreground">
              {tracks.length} TRACKS · {formatTime(tracks.reduce((a, s) => a + (s.duration || 0), 0))}
            </span>
          </span>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
              isOpen && 'rotate-180',
            )}
          />
        </button>

        <button
          type="button"
          onClick={() => onPlayPlaylist(pl.id)}
          aria-label={`播放播放序列 ${pl.name}`}
          className="clip-corner-sm flex h-9 w-9 shrink-0 items-center justify-center bg-primary text-primary-foreground transition-transform active:scale-95"
        >
          <Play className="h-4 w-4 translate-x-[1px]" />
        </button>

        {!isFav && (
          <>
            <button
              type="button"
              onClick={() => {
                setNameDraft(pl.name);
                setRenaming(true);
              }}
              aria-label={`重命名播放序列 ${pl.name}`}
              className="shrink-0 p-1.5 text-muted-foreground/40 transition-colors hover:text-primary"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDeletePlaylist(pl.id)}
              aria-label={`删除播放序列 ${pl.name}`}
              className="shrink-0 p-1.5 text-muted-foreground/40 transition-colors hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
      )}

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.ul
            key="tracks"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            {tracks.length === 0 ? (
              <li className="px-4 pb-3 font-mono text-[10px] tracking-widest text-muted-foreground/60">
                EMPTY — 从介质库添加介质到该清单
              </li>
            ) : (
              tracks.map((song, i) => {
                const current = song.id === currentId;
                return (
                  <li key={song.id} className="flex items-center gap-2 border-t border-border/60 px-3 py-1.5">
                    <button
                      type="button"
                      onClick={() => onPlaySong(song.id)}
                      aria-label={`播放 ${song.title}`}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span className="w-5 shrink-0 text-center font-mono text-[9px] text-muted-foreground">
                        {current ? (
                          <span className="flex justify-center">
                            <EqBars className="h-2" />
                          </span>
                        ) : (
                          String(i + 1).padStart(2, '0')
                        )}
                      </span>
                      <CoverArt cover={song.cover} title={song.title} artist={song.artist} deviceAlbumId={song.deviceAlbumId} devicePath={song.devicePath} className="h-8 w-8" />
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            'block truncate text-[12px]',
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
                    </button>
                    {isFav ? (
                      <button
                        type="button"
                        onClick={() => onToggleFavorite(song.id)}
                        aria-label={`取消收藏 ${song.title}`}
                        className="shrink-0 p-1 text-primary transition-colors"
                      >
                        <Heart className="h-3 w-3 fill-primary" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onRemoveFromPlaylist(pl.id, song.id)}
                        aria-label={`从播放序列移除 ${song.title}`}
                        className="shrink-0 p-1 text-muted-foreground/40 transition-colors hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </li>
                );
              })
            )}
          </motion.ul>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

/** Playlists tab: favorites + user-created lists with inline track management. */
export default function PlaylistsView() {
  const {
    songs,
    playlists,
    currentId,
    isPlaying,
    activeQueueId,
    playSong,
    playPlaylist,
    createPlaylist,
    deletePlaylist,
    removeFromPlaylist,
    renamePlaylist,
    toggleFavorite,
  } = usePlayer();
  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const favorites = playlists.find((p) => p.id === FAVORITES_ID);
  const custom = playlists.filter((p) => p.id !== FAVORITES_ID);

  const submitCreate = () => {
    const name = draft.trim();
    if (!name) return;
    createPlaylist(name);
    setDraft('');
  };

  const cardProps = {
    songs,
    currentId,
    activeQueueId,
    expanded,
    onToggleExpand: (id: string) => setExpanded((cur) => (cur === id ? null : id)),
    onPlaySong: playSong,
    onPlayPlaylist: playPlaylist,
    onDeletePlaylist: deletePlaylist,
    onRenamePlaylist: renamePlaylist,
    onRemoveFromPlaylist: removeFromPlaylist,
    onToggleFavorite: toggleFavorite,
  };

  return (
    <div className="flex flex-col gap-4 px-4 pb-6 pt-4">
      <header>
        <p className="font-mono text-[10px] tracking-[0.28em] text-primary">
          AUDIO TERMINAL // SEQUENCE NODE [AUD-02]
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-wide text-foreground">播放序列</h1>
        <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
          QUEUE MANIFESTS — 播放队列清单
        </p>
      </header>

      {/* create inline */}
      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitCreate();
          }}
          placeholder="新建播放序列名称…"
          maxLength={32}
          className="clip-corner-sm min-w-0 flex-1 border border-border bg-secondary px-3 py-2 font-mono text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary"
        />
        <button
          type="button"
          onClick={submitCreate}
          disabled={!draft.trim()}
          aria-label="新建播放序列"
          className="clip-corner-sm flex h-10 w-10 shrink-0 items-center justify-center bg-primary text-primary-foreground transition-transform active:scale-95 disabled:opacity-40"
        >
          <Plus className="h-4.5 w-4.5" />
        </button>
      </div>

      {/* playlists */}
      <ul className="flex flex-col gap-1.5">
        {favorites && <PlaylistCard pl={favorites} {...cardProps} />}
        {custom.map((pl) => (
          <PlaylistCard key={pl.id} pl={pl} {...cardProps} />
        ))}
        {custom.length === 0 && (
          <li className="mt-2 border border-dashed border-border/70 px-4 py-6 text-center font-mono text-[11px] leading-relaxed tracking-wider text-muted-foreground/70">
            未创建播放序列
            <br />
            输入名称创建你的第一个队列清单
          </li>
        )}
      </ul>

      {/* favorites usage hint */}
      {isPlaying && currentId && (
        <p className="font-mono text-[9px] tracking-widest text-muted-foreground/50">
          提示：介质库中点击 ♥ 可将介质加入收藏清单
        </p>
      )}
    </div>
  );
}
