import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import type { ISong, PlayMode } from '@/lib/music';
import { PLAY_MODES, makeId } from '@/lib/music';
import type { Playlist } from '@/lib/playlists';
import { FAVORITES_ID, makePlaylistId, normalizePlaylistName } from '@/lib/playlists';
import {
  deleteSong,
  getAllPlaylists,
  getAllSongs,
  putPlaylist,
  putSong,
  deletePlaylist as dbDeletePlaylist,
} from '@/lib/db';
import { fetchItunesCover, parseAudioFile, toSong } from '@/lib/parser';
import { PlayerContext, type PlayerContextState } from '@/lib/player-context';
import MediaSessionBridge from '@/components/player/MediaSessionBridge';

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
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [activeQueueId, setActiveQueueId] = useState<string | null>(null);
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

  /** Resolved queue for the active context: playlist songs or the whole library. */
  const queue = useMemo(() => {
    if (activeQueueId === null) return songs;
    const pl = playlists.find((p) => p.id === activeQueueId);
    if (!pl) return songs;
    return pl.songIds
      .map((id) => songs.find((s) => s.id === id))
      .filter((s): s is ISong => Boolean(s));
  }, [activeQueueId, playlists, songs]);

  // Restore the library + playlists from IndexedDB once on mount.
  useEffect(() => {
    void getAllSongs().then((list) => {
      const sorted = [...list].sort((a, b) => a.addedAt - b.addedAt);
      setSongs(sorted);
    });
    void getAllPlaylists().then((list) => {
      const sorted = [...list].sort((a, b) => a.createdAt - b.createdAt);
      setPlaylists(() => {
        const merged = [...sorted];
        // Guarantee the built-in favorites playlist exists.
        if (!merged.some((p) => p.id === FAVORITES_ID)) {
          const fav: Playlist = {
            id: FAVORITES_ID,
            name: '收藏',
            songIds: [],
            createdAt: 0,
          };
          merged.unshift(fav);
          void putPlaylist(fav);
        }
        return merged;
      });
    });
  }, []);

  const playSong = useCallback(
    (id: string) => {
      const song = songs.find((s) => s.id === id);
      const audio = audioRef.current;
      if (!song || !audio) return;
      // If the song is not part of the active playlist context, fall back to the whole library.
      setActiveQueueId((cur) => {
        if (cur === null) return cur;
        const pl = playlists.find((p) => p.id === cur);
        return pl && pl.songIds.includes(id) ? cur : null;
      });
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
    [songs, playlists, volume, muted],
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
    if (queue.length === 0) return;
    if (mode === 'shuffle') {
      const next = queue[Math.floor(Math.random() * queue.length)];
      playSong(next.id);
      return;
    }
    const idx = queue.findIndex((s) => s.id === currentId);
    const nextIdx = idx === -1 ? 0 : (idx + 1) % queue.length;
    playSong(queue[nextIdx].id);
  }, [queue, currentId, mode, playSong]);

  const playPrev = useCallback(() => {
    if (queue.length === 0) return;
    if (mode === 'shuffle') {
      const next = queue[Math.floor(Math.random() * queue.length)];
      playSong(next.id);
      return;
    }
    const idx = queue.findIndex((s) => s.id === currentId);
    const nextIdx = idx <= 0 ? queue.length - 1 : idx - 1;
    playSong(queue[nextIdx].id);
  }, [queue, currentId, mode, playSong]);

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
      // Drop the id from every playlist too.
      setPlaylists((prev) => {
        const changed: Playlist[] = [];
        for (const pl of prev) {
          if (pl.songIds.includes(id)) {
            const next = { ...pl, songIds: pl.songIds.filter((sid) => sid !== id) };
            void putPlaylist(next);
            changed.push(next);
          } else {
            changed.push(pl);
          }
        }
        return changed;
      });
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

  // ---- Favorites ---------------------------------------------------------
  const toggleFavorite = useCallback((id: string) => {
    setSongs((prev) => {
      const target = prev.find((s) => s.id === id);
      if (!target) return prev;
      const next = { ...target, favorited: !target.favorited };
      void putSong(next);
      return prev.map((s) => (s.id === id ? next : s));
    });
    setPlaylists((prev) =>
      prev.map((pl) => {
        if (pl.id !== FAVORITES_ID) return pl;
        const has = pl.songIds.includes(id);
        const songIds = has ? pl.songIds.filter((sid) => sid !== id) : [...pl.songIds, id];
        const next = { ...pl, songIds };
        void putPlaylist(next);
        return next;
      }),
    );
  }, []);

  // ---- Playlists ---------------------------------------------------------
  const createPlaylist = useCallback((name: string) => {
    const pl: Playlist = {
      id: makePlaylistId(),
      name: normalizePlaylistName(name),
      songIds: [],
      createdAt: Date.now(),
    };
    void putPlaylist(pl);
    setPlaylists((prev) => [...prev, pl]);
    return pl.id;
  }, []);

  const renamePlaylist = useCallback((id: string, name: string) => {
    setPlaylists((prev) =>
      prev.map((pl) => {
        if (pl.id !== id) return pl;
        const next = { ...pl, name: normalizePlaylistName(name) };
        void putPlaylist(next);
        return next;
      }),
    );
  }, []);

  const deletePlaylist = useCallback(
    (id: string) => {
      if (id === FAVORITES_ID) return;
      void dbDeletePlaylist(id);
      setPlaylists((prev) => prev.filter((pl) => pl.id !== id));
      setActiveQueueId((cur) => (cur === id ? null : cur));
    },
    [],
  );

  const addToPlaylist = useCallback((playlistId: string, songId: string) => {
    setPlaylists((prev) =>
      prev.map((pl) => {
        if (pl.id !== playlistId || pl.songIds.includes(songId)) return pl;
        const next = { ...pl, songIds: [...pl.songIds, songId] };
        void putPlaylist(next);
        return next;
      }),
    );
  }, []);

  const removeFromPlaylist = useCallback((playlistId: string, songId: string) => {
    setPlaylists((prev) =>
      prev.map((pl) => {
        if (pl.id !== playlistId || !pl.songIds.includes(songId)) return pl;
        const next = { ...pl, songIds: pl.songIds.filter((sid) => sid !== songId) };
        void putPlaylist(next);
        return next;
      }),
    );
  }, []);

  const playPlaylist = useCallback(
    (id: string | null) => {
      setActiveQueueId(id);
      if (id === null) {
        if (songs.length > 0) playSong(songs[0].id);
        return;
      }
      const pl = playlists.find((p) => p.id === id);
      const first = pl?.songIds.map((sid) => songs.find((s) => s.id === sid)).find(Boolean);
      if (first) playSong(first.id);
      else if (songs.length > 0) playSong(songs[0].id);
    },
    [songs, playlists, playSong],
  );

  const setActiveQueue = useCallback((id: string | null) => {
    setActiveQueueId(id);
  }, []);

  const removeFromQueue = useCallback(
    (id: string) => {
      if (activeQueueId === null) {
        removeSong(id);
        return;
      }
      removeFromPlaylist(activeQueueId, id);
    },
    [activeQueueId, removeSong, removeFromPlaylist],
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
    activeQueueId,
    queue,
    playlists,
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
    toggleFavorite,
    createPlaylist,
    renamePlaylist,
    deletePlaylist,
    addToPlaylist,
    removeFromPlaylist,
    playPlaylist,
    setActiveQueue,
    removeFromQueue,
  };

  return (
    <PlayerContext.Provider value={value}>
      {children}
      <MediaSessionBridge />
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
