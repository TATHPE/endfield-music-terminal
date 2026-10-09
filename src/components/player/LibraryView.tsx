// EXPORTS: LibraryView
import { useRef, useState } from 'react';
import { useWindowedList } from '@/hooks/use-windowed-list';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { FileAudio, Loader2, Radar, Settings, Tags, Upload, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { usePlayer } from '@/lib/player-context';
import { formatClock } from '@/lib/music';
import { cn } from '@/lib/utils';
import { MediaScanner } from '@/lib/media-scanner';
import ImportButton from '@/components/player/ImportButton';
import TrackRow from '@/components/player/TrackRow';
import PlaylistAddSheet from '@/components/player/PlaylistAddSheet';

const MEDIA_TAGS = ['战场记录', '通讯日志', 'BGM', '环境音'] as const;

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.035 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.24, ease: 'easeOut' as const } },
};

/** Terminal-style sheet for assigning base-archive tags to one track. */
function TagSheet({ songId, onClose }: { songId: string | null; onClose: () => void }) {
  const { songs, setSongTags } = usePlayer();
  if (!songId) return null;
  const song = songs.find((s) => s.id === songId);
  if (!song) return null;
  const active = song.tags ?? [];

  const toggle = (tag: string) => {
    const next = active.includes(tag) ? active.filter((t) => t !== tag) : [...active, tag];
    setSongTags(song.id, next);
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-background/70" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-label="介质标签"
        onClick={(e) => e.stopPropagation()}
        className="clip-corner w-full max-w-[430px] border-t border-primary/40 bg-card p-4"
      >
        <div className="flex items-center justify-between">
          <p className="font-mono text-[10px] tracking-[0.28em] text-primary">MEDIA TAGS // 介质标签</p>
          <button type="button" onClick={onClose} aria-label="关闭" className="p-1 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <h2 className="mt-1 truncate text-sm font-bold text-foreground">{song.title}</h2>
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          {MEDIA_TAGS.map((tag) => {
            const on = active.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggle(tag)}
                className={cn(
                  'clip-corner-sm flex items-center justify-between border px-3 py-2 font-mono text-xs tracking-wider transition-colors',
                  on
                    ? 'border-primary/60 bg-primary/15 text-primary'
                    : 'border-border bg-secondary/60 text-muted-foreground',
                )}
              >
                <Tags className="h-3.5 w-3.5" />
                {tag}
                <span className={cn('h-3 w-3 border', on ? 'border-primary bg-primary' : 'border-border')} />
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="font-mono text-[9px] tracking-widest text-muted-foreground/70">
            {active.length === 0 ? 'NO TAG ASSIGNED' : `TAG${active.length > 1 ? 'S' : ''}: ${active.join(' / ')}`}
          </span>
          {active.length > 0 && (
            <button
              type="button"
              onClick={() => setSongTags(song.id, [])}
              className="font-mono text-[10px] tracking-widest text-destructive hover:text-foreground"
            >
              CLEAR
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Library view: import, device scan, statistics readout, tag filter and track list. */
export default function LibraryView() {
  const { songs, currentId, playSong, removeSong, importFiles, toggleFavorite, scanDeviceSongs, scanLogs } = usePlayer();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [addTarget, setAddTarget] = useState<string | null>(null);
  const [tagTarget, setTagTarget] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [permDialog, setPermDialog] = useState(false);

  const filtered = tagFilter ? songs.filter((s) => s.tags?.includes(tagFilter)) : songs;
  const total = filtered.reduce((acc, s) => acc + (s.duration || 0), 0);
  const recentLogs = scanLogs.slice(-6);

  const handleFiles = (files: FileList | null) => {
    if (files && files.length > 0) {
      void importFiles(files);
    }
  };

  const handleScan = async () => {
    if (!Capacitor.isNativePlatform() || scanning) return;
    setScanning(true);
    setScanMsg(null);
    setPermDialog(false);
    try {
      const r = await scanDeviceSongs();
      if (r.failed > 0) {
        if (r.permissionDenied) {
          setScanMsg('SCAN FAILED — 存储权限被拒绝');
          // ROMs that suppressed the system dialog land here: offer a direct
          // jump into the app's system permission page instead of dead-ending.
          setPermDialog(true);
        } else {
          setScanMsg(r.error ? `SCAN FAILED — ${r.error}` : 'SCAN FAILED — 扫描设备音频异常');
        }
      } else {
        setScanMsg(
          r.added > 0
            ? `SCAN OK — 新增 ${r.added} 首 · 跳过 ${r.skipped} 首 · 本地歌词已读取`
            : r.skipped > 0
              ? `SCAN OK — 设备歌曲已全部在介质库（${r.skipped} 首）`
              : 'SCAN OK — 设备中未发现可导入的音频',
        );
      }
    } catch {
      setScanMsg('SCAN FAILED — 扫描异常');
    } finally {
      setScanning(false);
    }
  };

  // Long libraries render a window of rows instead of the whole list; short ones
  // keep the original animated list (see useWindowedList).
  const listRef = useRef<HTMLUListElement | null>(null);
  const windowed = useWindowedList(filtered.length, listRef);
  const visibleSongs = windowed.active ? filtered.slice(windowed.start, windowed.end) : filtered;

  return (
    <div className="flex flex-col gap-4 px-4 pb-6 pt-4">
      {/* Header */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.28em] text-primary">
            AUDIO TERMINAL // MEDIA NODE [AUD-01]
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-wide text-foreground">介质库</h1>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5 font-mono text-[10px] tracking-widest text-muted-foreground">
            <span className="whitespace-nowrap">ORIGIN NODE</span>
            <span aria-hidden className="whitespace-nowrap opacity-50">—</span>
            <span className="whitespace-nowrap">本地音频存储</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {Capacitor.isNativePlatform() && (
            <button
              type="button"
              onClick={handleScan}
              disabled={scanning}
              className="clip-corner-sm group relative flex items-center gap-1.5 border border-border/80 bg-card/70 px-2.5 py-2 text-xs font-semibold text-foreground transition-colors hover:border-primary/70 hover:text-primary disabled:opacity-60"
            >
              <span aria-hidden className="hazard-stripe absolute inset-x-0 top-0 h-[3px] opacity-60" />
              {scanning ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" strokeWidth={2.4} />
              ) : (
                <Radar className="h-4 w-4 text-primary" strokeWidth={2.2} />
              )}
              扫描设备
            </button>
          )}
          <ImportButton onClick={() => fileRef.current?.click()} className="mt-1 shrink-0" />
        </div>
      </header>

      {/* Scan status readout */}
      {scanMsg && (
        <div className="flex items-center justify-between border-x border-primary/40 bg-primary/10 px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] text-primary">
          <span className={scanMsg.startsWith('SCAN FAILED') ? 'text-destructive' : 'text-primary'}>
            {scanMsg}
          </span>
          <button
            type="button"
            aria-label="清除提示"
            onClick={() => setScanMsg(null)}
            className="text-muted-foreground hover:text-primary"
          >
            ×
          </button>
        </div>
      )}

      {/* Statistics readout */}
      <div className="flex items-center justify-between border-y border-border/80 py-2 font-mono text-[10px] tracking-[0.14em] text-muted-foreground">
        <span>
          TRACKS <b className="ml-1 text-primary">{filtered.length}</b>
          {tagFilter && <span className="ml-1 text-hint">[{tagFilter}]</span>}
        </span>
        <span>
          TOTAL <b className="ml-1 text-foreground">{formatClock(total)}</b>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="blink-dot inline-block h-1 w-1 rounded-full bg-success" />
          <span className="text-success">READY</span>
        </span>
      </div>

      {/* Media tag filter row */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setTagFilter(null)}
          className={cn(
            'clip-tag shrink-0 px-2.5 py-1 font-mono text-[9px] tracking-[0.18em] transition-colors',
            tagFilter === null ? 'bg-primary text-primary-foreground' : 'border border-border/70 text-muted-foreground',
          )}
        >
          ALL
        </button>
        {MEDIA_TAGS.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
            className={cn(
              'clip-tag shrink-0 px-2.5 py-1 font-mono text-[9px] tracking-[0.18em] transition-colors',
              tagFilter === tag ? 'bg-hint text-hint-foreground' : 'border border-border/70 text-muted-foreground hover:text-foreground',
            )}
          >
            {tag}
          </button>
        ))}
      </div>

      {/* Import / scan terminal log stream */}
      {scanLogs.length > 0 && (
        <div className="border border-border/70 bg-background/70">
          <button
            type="button"
            onClick={() => setLogsOpen((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-1.5 font-mono text-[9px] tracking-[0.24em] text-muted-foreground"
          >
            <span className="text-primary">SYSTEM LOG</span>
            <span>{logsOpen ? '▼ 收起' : `▲ ${recentLogs.length} LINES`}</span>
          </button>
          {logsOpen && (
            <ul className="flex flex-col gap-0.5 border-t border-border/60 px-3 py-2 font-mono text-[9px] leading-relaxed tracking-wider text-muted-foreground">
              {recentLogs.map((line, i) => (
                <li key={`${i}-${line}`} className="flex gap-2">
                  <span className="text-primary/70">&gt;</span>
                  <span className={line.includes('FAILED') || line.includes('DENIED') ? 'text-destructive' : 'text-foreground/75'}>
                    {line}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Track list / empty state */}
      {filtered.length === 0 ? (
        <div
          className="clip-corner-lg relative mt-6 flex flex-col items-center gap-4 border border-dashed border-border/80 bg-card/40 px-6 py-12 text-center"
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFiles(e.dataTransfer.files);
          }}
        >
          <div aria-hidden className="hazard-stripe h-1 w-24 opacity-70" />
          <FileAudio className="h-10 w-10 text-primary/70" strokeWidth={1.4} />
          <div>
            <p className="font-mono text-[10px] tracking-[0.25em] text-primary/80">
              // NO LOCAL DATA
            </p>
            <p className="text-base font-semibold text-foreground">{tagFilter ? `无「${tagFilter}」标签的介质` : '介质库为空'}</p>
            <p className="mt-2 font-mono text-[11px] leading-loose tracking-wider text-muted-foreground">
              {tagFilter ? '可切换标签筛选或清除过滤条件' : '未检测到本地音频数据'}
              <br />
              支持「扫描设备」与「导入曲目」
              <br />
              或将音频文件直接拖拽到此处
            </p>
          </div>
          <div aria-hidden className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.2em] text-muted-foreground/70">
            <span className="block-cursor inline-block h-3 w-1.5 bg-primary" />
            SYSTEM READY — 等待数据输入
          </div>
          <div className="flex items-center gap-3">
            {Capacitor.isNativePlatform() && (
              <button
                type="button"
                onClick={handleScan}
                disabled={scanning}
                className="clip-corner-sm group relative flex items-center gap-2 border border-border/80 bg-card/70 px-5 py-3 text-base font-semibold text-foreground transition-colors hover:border-primary/70 hover:text-primary disabled:opacity-60"
              >
                <span aria-hidden className="hazard-stripe absolute inset-x-0 top-0 h-[3px] opacity-60" />
                {scanning ? (
                  <Loader2 className="h-5 w-5 animate-spin text-primary" strokeWidth={2.4} />
                ) : (
                  <Radar className="h-5 w-5 text-primary" strokeWidth={2.2} />
                )}
                扫描设备
              </button>
            )}
            <ImportButton large onClick={() => fileRef.current?.click()} />
          </div>
        </div>
      ) : windowed.active ? (
        <ul ref={listRef} className="flex flex-col gap-1">
          {windowed.topPad > 0 && <li aria-hidden style={{ height: windowed.topPad }} />}
          {visibleSongs.map((song, i) => {
            const index = windowed.start + i;
            return (
              <li key={song.id} ref={i === 0 ? windowed.measureRow : undefined}>
                <TrackRow
                  song={song}
                  index={index}
                  isCurrent={song.id === currentId}
                  onPlay={() => playSong(song.id)}
                  onRemove={() => removeSong(song.id)}
                  onToggleFavorite={() => toggleFavorite(song.id)}
                  onAddToPlaylist={() => setAddTarget(song.id)}
                  onTag={() => setTagTarget(song.id)}
                />
              </li>
            );
          })}
          {windowed.bottomPad > 0 && <li aria-hidden style={{ height: windowed.bottomPad }} />}
        </ul>
      ) : (
        <motion.ul
          variants={listVariants}
          initial="hidden"
          animate="show"
          className="flex flex-col gap-1"
        >
          {filtered.map((song, i) => (
            <motion.li key={song.id} variants={itemVariants} layout="position">
              <TrackRow
                song={song}
                index={i}
                isCurrent={song.id === currentId}
                onPlay={() => playSong(song.id)}
                onRemove={() => removeSong(song.id)}
                onToggleFavorite={() => toggleFavorite(song.id)}
                onAddToPlaylist={() => setAddTarget(song.id)}
                onTag={() => setTagTarget(song.id)}
              />
            </motion.li>
          ))}
        </motion.ul>
      )}

      {/* Drag-over overlay */}
      {dragOver &&
        createPortal(
          <div className="clip-corner-sm pointer-events-none fixed inset-0 z-[80] flex items-center justify-center bg-background/85">
            <div className="clip-corner-lg flex flex-col items-center gap-3 border border-primary/60 bg-card px-10 py-8">
              <Upload className="h-8 w-8 text-primary" />
              <p className="font-mono text-sm tracking-[0.2em] text-primary">释放以导入音频</p>
              <div aria-hidden className="hazard-stripe h-1 w-20 opacity-80" />
            </div>
          </div>,
          document.body,
        )}

      {/* Add-to-playlist sheet */}
      <PlaylistAddSheet open={addTarget !== null} songId={addTarget} onClose={() => setAddTarget(null)} />

      {/* Media tag sheet */}
      <TagSheet songId={tagTarget} onClose={() => setTagTarget(null)} />

      {/* Permission-required dialog: direct jump into the system app-details page */}
      {permDialog &&
        createPortal(
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-background/70 px-6">
            <div className="clip-corner-lg w-full max-w-sm border border-primary/50 bg-card p-5 shadow-[0_0_40px_rgba(242,194,0,0.14)]">
              <p className="font-mono text-[10px] tracking-[0.28em] text-primary">PERMISSION REQUIRED</p>
              <h2 className="mt-1.5 flex items-center gap-2 text-lg font-bold text-foreground">
                <Settings className="h-5 w-5 text-primary" strokeWidth={2} />
                存储权限被拒绝
              </h2>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                扫描设备需要访问手机中的音频文件。部分系统不会再次弹出权限请求，请前往系统设置手动开启「音乐和音频」（低版本为「存储」）权限，然后返回重新扫描。
              </p>
              <div aria-hidden className="hazard-stripe mt-3 h-[3px] opacity-60" />
              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPermDialog(false)}
                  className="clip-corner-sm flex-1 border border-border/80 bg-secondary/50 py-2.5 font-mono text-xs tracking-widest text-muted-foreground transition-colors hover:text-foreground"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPermDialog(false);
                    void MediaScanner.openSettings();
                  }}
                  className="clip-corner-sm flex-1 bg-primary py-2.5 font-mono text-xs font-bold tracking-widest text-primary-foreground transition-transform active:scale-95"
                >
                  前往设置开启
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Shared hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
