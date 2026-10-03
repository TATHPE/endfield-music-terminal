import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import type { ISong, PlayMode } from '@/lib/music';
import { PLAY_MODES, makeId } from '@/lib/music';
import { deleteSong, getAllSongs, putSong } from '@/lib/db';
import { fetchItunesCover, parseAudioFile, toSong } from '@/lib/parser';
import { PlayerContext, type PlayerContextState } from '@/lib/player-context';

const VOLUME_KEY = 'endfield-player:volume';
const MODE_KEY = 'endfield-player:mode';

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export default function PlayerProvider({ children }: { children: ReactNode }) {
  const [songs, setSongs] = useState<ISong[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mode, setMode] = useState<PlayMode>(() => readStored<PlayMode>(MODE_KEY, 'sequence'));
  const [volume, setVolumeState] = useState<number>(() => readStored<number>(VOLUME_KEY, 0.8));
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  const currentSong = songs.find((s) => s.id === currentId) || null;

  // Restore the library from IndexedDB once on mount.
  useEffect(() => {
    void getAllSongs().then((list) => {
      const sorted = [...list].sort((a, b) => a.addedAt - b.addedAt);
      setSongs(sorted);
    });
  }, []);

  const playSong = useCallback(
    (id: string) => {
      const song = songs.find((s) => s.id === id);
      const audio = audioRef.current;
      if (!song || !audio) return;
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
      const url = URL.createObjectURL(song.audio);
      urlRef.current = url;
      setCurrentId(id);
      audio.src = url;
      audio.volume = muted ? 0 : volume;
      setCurrentTime(0);
      setDuration(song.duration || 0);
      void audio.play();
    },
    [songs, volume, muted],
  );

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (currentId && audio.src) {
      if (audio.paused) {
        void audio.play();
      } else {
        audio.pause();
      }
      return;
    }
    if (songs.length > 0) playSong(songs[0].id);
  }, [currentId, songs, playSong]);

  const playNext = useCallback(() => {
    if (songs.length === 0) return;
    if (mode === 'shuffle') {
      const next = songs[Math.floor(Math.random() * songs.length)];
      playSong(next.id);
      return;
    }
    const idx = songs.findIndex((s) => s.id === currentId);
    const nextIdx = idx === -1 ? 0 : (idx + 1) % songs.length;
    playSong(songs[nextIdx].id);
  }, [songs, currentId, mode, playSong]);

  const playPrev = useCallback(() => {
    if (songs.length === 0) return;
    if (mode === 'shuffle') {
      const next = songs[Math.floor(Math.random() * songs.length)];
      playSong(next.id);
      return;
    }
    const idx = songs.findIndex((s) => s.id === currentId);
    const nextIdx = idx <= 0 ? songs.length - 1 : idx - 1;
    playSong(songs[nextIdx].id);
  }, [songs, currentId, mode, playSong]);

  const handleEnded = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (mode === 'repeat-one') {
      audio.currentTime = 0;
      void audio.play();
      return;
    }
    playNext();
  }, [mode, playNext]);

  const seek = useCallback((t: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(t)) return;
    audio.currentTime = t;
    setCurrentTime(t);
  }, []);

  const cycleMode = useCallback(() => {
    setMode((prev) => {
      const next = PLAY_MODES[(PLAY_MODES.indexOf(prev) + 1) % PLAY_MODES.length];
      try {
        localStorage.setItem(MODE_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  }, []);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.min(1, Math.max(0, v));
    const audio = audioRef.current;
    if (audio) audio.volume = clamped;
    setVolumeState(clamped);
    if (clamped > 0 && audio) audio.muted = false;
    if (clamped > 0) setMuted(false);
    try {
      localStorage.setItem(VOLUME_KEY, JSON.stringify(clamped));
    } catch {
      /* storage unavailable */
    }
  }, []);

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
    setMuted(audio.muted);
  }, []);

  const importFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files).filter(
      (f) =>
        f.type.startsWith('audio/') ||
        /\.(mp3|flac|m4a|wav|ogg|aac|opus|ape|wma|aiff)$/i.test(f.name),
    );
    if (list.length === 0) {
      toast.error('未检测到音频文件');
      return;
    }
    let ok = 0;
    let fail = 0;
    for (const file of list) {
      try {
        const meta = await parseAudioFile(file);
        const song = toSong(meta, file, makeId(), Date.now());
        await putSong(song);
        setSongs((prev) => [...prev, song]);
        ok += 1;
        if (!song.cover) {
          void fetchItunesCover(song.artist, song.title).then((cover) => {
            if (!cover) return;
            const updated = { ...song, cover };
            void putSong(updated).then(() => {
              setSongs((prev) => prev.map((s) => (s.id === song.id ? updated : s)));
            });
          });
        }
      } catch {
        fail += 1;
      }
    }
    if (ok > 0) {
      toast.success(`已导入 ${ok} 首曲目${fail > 0 ? `，${fail} 首解析失败` : ''}`);
    } else if (fail > 0) {
      toast.error('导入失败，请检查音频文件格式');
    }
  }, []);

  const removeSong = useCallback(
    (id: string) => {
      void deleteSong(id);
      setSongs((prev) => prev.filter((s) => s.id !== id));
      if (currentId === id) {
        const audio = audioRef.current;
        if (audio) {
          audio.pause();
          audio.removeAttribute('src');
          audio.load();
        }
        if (urlRef.current) {
          URL.revokeObjectURL(urlRef.current);
          urlRef.current = null;
        }
        setCurrentId(null);
        setCurrentTime(0);
        setDuration(0);
        setIsPlaying(false);
      }
    },
    [currentId],
  );

  const value: PlayerContextState = {
    songs,
    currentId,
    currentSong,
    isPlaying,
    mode,
    volume,
    muted,
    currentTime,
    duration,
    importFiles,
    removeSong,
    playSong,
    togglePlay,
    playNext,
    playPrev,
    seek,
    cycleMode,
    setVolume,
    toggleMute,
  };

  return (
    <PlayerContext.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        className="hidden"
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration || 0)}
        onEnded={handleEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />
    </PlayerContext.Provider>
  );
}
