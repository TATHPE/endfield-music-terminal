import { useRef, useState } from 'react';
import { FileAudio, Upload } from 'lucide-react';
import { usePlayer } from '@/lib/player-context';
import { formatClock } from '@/lib/music';
import ImportButton from '@/components/player/ImportButton';
import TrackRow from '@/components/player/TrackRow';

/** Library view: import, statistics readout and track list. */
export default function LibraryView() {
  const { songs, currentId, playSong, removeSong, importFiles } = usePlayer();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const total = songs.reduce((acc, s) => acc + (s.duration || 0), 0);

  const handleFiles = (files: FileList | null) => {
    if (files && files.length > 0) {
      void importFiles(files);
    }
  };

  return (
    <div className="flex flex-col gap-4 px-4 pb-6 pt-4">
      {/* Header */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.28em] text-primary">
            AUDIO TERMINAL // LOCAL LIBRARY
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-wide text-foreground">曲库</h1>
          <p className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
            ORIGIN NODE — 本地音频存储
          </p>
        </div>
        <ImportButton onClick={() => fileRef.current?.click()} className="mt-1 shrink-0" />
      </header>

      {/* Statistics readout */}
      <div className="flex items-center justify-between border-y border-border/80 py-2 font-mono text-[10px] tracking-[0.14em] text-muted-foreground">
        <span>
          TRACKS <b className="ml-1 text-primary">{songs.length}</b>
        </span>
        <span>
          TOTAL <b className="ml-1 text-foreground">{formatClock(total)}</b>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="blink-dot inline-block h-1 w-1 rounded-full bg-success" />
          <span className="text-success">READY</span>
        </span>
      </div>

      {/* Track list / empty state */}
      {songs.length === 0 ? (
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
            <p className="text-base font-semibold text-foreground">曲库为空</p>
            <p className="mt-1 font-mono text-[11px] leading-relaxed tracking-wider text-muted-foreground">
              未检测到本地音频数据
              <br />
              导入曲目或拖拽音频文件到此处
            </p>
          </div>
          <ImportButton large onClick={() => fileRef.current?.click()} />
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {songs.map((song, i) => (
            <TrackRow
              key={song.id}
              song={song}
              index={i}
              isCurrent={song.id === currentId}
              onPlay={() => playSong(song.id)}
              onRemove={() => removeSong(song.id)}
            />
          ))}
        </ul>
      )}

      {/* Drag-over overlay */}
      {dragOver && (
        <div className="clip-corner-sm pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-background/85">
          <div className="clip-corner-lg flex flex-col items-center gap-3 border border-primary/60 bg-card px-10 py-8">
            <Upload className="h-8 w-8 text-primary" />
            <p className="font-mono text-sm tracking-[0.2em] text-primary">释放以导入音频</p>
            <div aria-hidden className="hazard-stripe h-1 w-20 opacity-80" />
          </div>
        </div>
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
