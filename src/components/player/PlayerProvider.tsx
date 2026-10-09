import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import type { ISong, PlayMode } from '@/lib/music';
import { PLAY_MODES } from '@/lib/music';
import type { Playlist } from '@/lib/playlists';
import { FAVORITES_ID, makePlaylistId } from '@/lib/playlists';
import {
  deleteSong,
  deleteMusicDatabase,
  getAllPlaylists,
  getAllSongs,
  putPlaylist,
  putSong,
} from '@/lib/db';
import { PlayerContext, type PlayerContextState } from '@/lib/player-context';
import { clearDeviceAudioCache, loadDeviceAudio, isNative } from '@/lib/media-scanner';
import MediaSessionBridge from '@/components/player/MediaSessionBridge';
import { shouldLog, type LogLevel } from '@/lib/terminal-config';
import { useDeviceLibrary } from '@/hooks/use-device-library';
import { usePlaylists } from '@/hooks/use-playlists';

const VOLUME_KEY = 'endfield-player:volume';
const MUTED_KEY = 'endfield-player:muted';
const MODE_KEY = 'endfield-player:mode';
const SPECTRUM_KEY = 'endfield-player:spectrum';
const PRESET_MANIFEST_URL = '/songs/manifest.json';
const SPECTRUM_BUCKETS = 24;
// fftSize 64 → frequencyBinCount 32
const FFT_BINS = 32;

/**
 * One WebAudio graph per page lifetime, held at module scope.
 * createMediaElementSource permanently binds an <audio> element — even after
 * AudioContext.close() it can never be rebound — so a StrictMode double-mount
 * must reuse the same graph rather than close and rebuild it.
 */
interface AudioGraph {
  ctx: AudioContext;
  analyser: AnalyserNode;
}
let sharedGraph: AudioGraph | null = null;

function acquireAudioGraph(audio: HTMLAudioElement): AudioGraph | null {
  if (sharedGraph) return sharedGraph;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    const ctx = new Ctor();
    const src = ctx.createMediaElementSource(audio);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.8;
    src.connect(analyser);
    analyser.connect(ctx.destination);
    sharedGraph = { ctx, analyser };
    void ctx.resume();
    return sharedGraph;
  } catch {
    return null;
  }
}

interface PresetTrack {
  file: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  codec: string;
  sampleRate: number;
  bitrate: number;
  cover?: string | null;
  lyrics?: string | null;
}

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
  const [muted, setMuted] = useState<boolean>(() => readStored<boolean>(MUTED_KEY, false));
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [scanLogs, setScanLogs] = useState<string[]>([]);
  const [spectrum, setSpectrum] = useState<number[]>(() => Array(SPECTRUM_BUCKETS).fill(0));
  const [spectrumOn, setSpectrumOnState] = useState<boolean>(() =>
    readStored<boolean>(SPECTRUM_KEY, true),
  );

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const spectrumOnRef = useRef(spectrumOn);
  // Sync outside render: writing a ref during render breaks the concurrent
  // rendering contract (react-hooks/refs) and can be read as a stale value.
  useEffect(() => {
    spectrumOnRef.current = spectrumOn;
  }, [spectrumOn]);
  // Apply the persisted volume / mute to the media element once it exists.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = muted ? 0 : volume;
    audio.muted = muted;
  }, [muted, volume]);
  // Guards async playback setup: only applies the result if the same song is
  // still the requested one (user may have tapped another track meanwhile).
  const currentIdRef = useRef<string | null>(null);
  // After a seek, ignore stale timeupdate events for a short window: the WebView
  // may still fire timeupdate with the pre-seek position until the actual seek
  // lands, which would overwrite the optimistic value and make lock-screen
  // scrubbers snap back.
  const seekGuardRef = useRef(0);

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

  // Load the bundled preset library (songs/manifest.json inside app assets).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // A lite build ships NO bundled songs. If a previous full build left
      // preset tracks in IndexedDB (overwrite install), those records point at
      // /songs/* assets that no longer exist -> clicking them fails to play.
      // Whenever the preset manifest is missing / empty / unreadable, drop any
      // stale preset records from the library and storage.
      const dropStalePresets = () => {
        setSongs((prev) => prev.filter((s) => !s.id.startsWith('preset:')));
        void getAllSongs().then((all) => {
          for (const s of all) {
            if (s.id.startsWith('preset:')) void deleteSong(s.id);
          }
        });
      };
      // Retry a few times: on a cold start the WebView's local asset server
      // may not be ready the moment this effect runs, and a flaky first fetch
      // must not silently wipe the bundled library.
      let manifest: PresetTrack[] | null = null;
      let explicitEmpty = false;
      for (let attempt = 0; attempt < 3 && !cancelled; attempt++) {
        try {
          // cache: 'no-store' is required: an upgrade install over a previous
          // lite build can serve a WebView-cached 404 for /songs/manifest.json,
          // which would drop the whole bundled library.
          const res = await fetch(PRESET_MANIFEST_URL, { cache: 'no-store' });
          if (!res.ok) {
            explicitEmpty = true;
            break;
          }
          const tracks = (await res.json()) as PresetTrack[];
          if (!Array.isArray(tracks) || tracks.length === 0) {
            explicitEmpty = true;
            break;
          }
          manifest = tracks;
          break;
        } catch {
          if (attempt < 2) await new Promise((r) => setTimeout(r, 800));
        }
      }
      if (cancelled) return;
      if (!manifest) {
        // Only an explicit 404/empty manifest is treated as "this build ships
        // no preset songs" and clears stale records. A network failure keeps
        // whatever is already in the library.
        if (explicitEmpty) dropStalePresets();
        return;
      }
      const tracks = manifest;
      // A build may ship the manifest without the audio files (a fresh clone has
      // no song assets). Probe every track so the library never lists dead
      // entries, and fall back to "no preset songs" when nothing is playable.
      const available = await Promise.all(
        tracks.map(async (t) => {
          try {
            const res = await fetch(`/songs/${encodeURIComponent(t.file)}`, {
              method: 'HEAD',
              cache: 'no-store',
            });
            return res.ok;
          } catch {
            return false;
          }
        }),
      );
      const missing = available.filter((ok) => !ok).length;
      if (missing > 0 && shouldLog('warn')) {
        setScanLogs((prev) => [
          ...prev.slice(-80),
          `PRESET AUDIO MISSING — ${missing}/${tracks.length} SKIPPED`,
        ]);
      }
      if (missing === tracks.length) {
        dropStalePresets();
        return;
      }
      const preset: ISong[] = [];
      for (const [index, t] of tracks.entries()) {
        if (!available[index]) continue;
        let cover: Blob | null = null;
          if (t.cover) {
            try {
              const c = await fetch(t.cover);
              cover = c.ok ? await c.blob() : null;
            } catch {
              cover = null;
            }
          }
          preset.push({
            id: `preset:${t.file}`,
            title: t.title || t.file,
            artist: t.artist || '铁痕电台-MSR',
            album: t.album || '明日方舟：终末地',
            duration: t.duration || 0,
            codec: t.codec || 'MP3',
            sampleRate: t.sampleRate || 0,
            bitrate: t.bitrate || 0,
            fileName: t.file,
            cover,
            lyrics: t.lyrics || undefined,
            presetUrl: `/songs/${encodeURIComponent(t.file)}`,
            audio: null,
            addedAt: 1700000000000 + preset.length,
          });
        }
      if (cancelled) return;
      setSongs((prev) => [...preset, ...prev.filter((s) => !s.id.startsWith('preset:'))]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Build the shared WebAudio graph once the <audio> element exists;
  // retry briefly if the ref isn't ready on the first pass. The graph is a
  // module-level singleton (see acquireAudioGraph), so remounts never rebind
  // the element.
  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | undefined;
    let attempts = 0;

    const build = () => {
      if (cancelled) return;
      const audio = audioRef.current;
      if (audio) {
        acquireAudioGraph(audio);
        return;
      }
      if (attempts < 10) {
        attempts += 1;
        retryTimer = window.setTimeout(build, 120);
      }
    };
    build();

    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, []);

  // Sample frequency data on a fixed interval while the readout is enabled.
  // Kept separate from graph setup so it keeps running even if graph
  // acquisition is still retrying.
  useEffect(() => {
    const bins = new Uint8Array(FFT_BINS);
    const timer = setInterval(() => {
      const graph = sharedGraph;
      if (!graph || !spectrumOnRef.current) return;
      graph.analyser.getByteFrequencyData(bins);
      const next = new Array<number>(SPECTRUM_BUCKETS);
      for (let i = 0; i < SPECTRUM_BUCKETS; i += 1) {
        const start = Math.floor((i / SPECTRUM_BUCKETS) * bins.length);
        const end = Math.max(start + 1, Math.floor(((i + 1) / SPECTRUM_BUCKETS) * bins.length));
        let sum = 0;
        for (let j = start; j < end; j += 1) sum += bins[j];
        next[i] = sum / (end - start);
      }
      setSpectrum(next);
    }, 66);
    return () => clearInterval(timer);
  }, []);

  const setSpectrumOn = useCallback((v: boolean) => {
    setSpectrumOnState(v);
    try {
      localStorage.setItem(SPECTRUM_KEY, JSON.stringify(v));
    } catch {
      /* storage unavailable */
    }
  }, []);

  /** Terminal log stream — gated by the LOG level chosen in 系统配置 (trace < info < warn < error). */
  const appendLog = useCallback((line: string, level: LogLevel = 'info') => {
    if (!shouldLog(level)) return;
    setScanLogs((prev) => [...prev.slice(-80), line]);
  }, []);

  // Import / scan / lyrics: src/hooks/use-device-library.ts
  const { importFiles, scanDeviceSongs, fetchLyricsOnline, importLyrics } = useDeviceLibrary({
    songs,
    setSongs,
    appendLog,
  });
  // Playlist CRUD: src/hooks/use-playlists.ts
  const { createPlaylist, renamePlaylist, deletePlaylist, addToPlaylist, removeFromPlaylist } =
    usePlaylists({ setPlaylists, setActiveQueueId });

  const playSong = useCallback(
    (id: string) => {
      const song = songs.find((s) => s.id === id);
      const audio = audioRef.current;
      if (!song || !audio) return;
      // User gesture — the AudioContext must be running for the analyser
      // to return live frequency data on mobile.
      void sharedGraph?.ctx.resume();
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
      setCurrentId(id);
      currentIdRef.current = id;
      audio.volume = muted ? 0 : volume;
      setCurrentTime(0);
      setDuration(song.duration || 0);
      const start = (src: string) => {
        audio.src = src;
        void audio.play().catch((err: unknown) => {
          // Surface the real failure (autoplay block, missing file, codec, ...)
          // instead of dying silently.
          const name = err instanceof Error ? err.name : String(err);
          setIsPlaying(false);
          toast.error(`播放失败（${name}）：${song.title}`);
        });
      };
      if (song.presetUrl) {
        // Bundled preset track: play straight from the in-app asset URL.
        start(song.presetUrl);
      } else if (song.devicePath && isNative()) {
        // Scanned device track: read the file through the native bridge into a
        // Blob-backed object URL. Blob playback is fully seekable — the
        // WebViewAssetLoader stream is not reliably Range-capable on ColorOS,
        // which made lock-screen scrubbers snap back. Oversized files fall back
        // to the asset-loader URL.
        void loadDeviceAudio(song.devicePath).then(({ url, oversized }) => {
          if (oversized && shouldLog('warn')) {
            appendLog(`MEDIA > 50 MB — STREAM FALLBACK: ${song.fileName}`, 'warn');
          }
          if (audioRef.current && currentIdRef.current === id) {
            audioRef.current.src = url;
            void audioRef.current.play().catch((err: unknown) => {
              const name = err instanceof Error ? err.name : String(err);
              setIsPlaying(false);
              toast.error(`播放失败（${name}）：${song.title}`);
            });
          }
        });
      } else if (song.audio) {
        const url = URL.createObjectURL(song.audio);
        urlRef.current = url;
        start(url);
      } else {
        return;
      }
    },
    [songs, playlists, volume, muted, appendLog],
  );

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (currentId && audio.src) {
      if (audio.paused) {
        void sharedGraph?.ctx.resume();
        void audio.play().catch((err: unknown) => {
          const name = err instanceof Error ? err.name : String(err);
          setIsPlaying(false);
          toast.error(`播放失败（${name}）`);
        });
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
    // Clamp to the real duration when known so an out-of-range seek target
    // (e.g. a ROM passing milliseconds as seconds) can't push the position
    // past the end and snap back.
    const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : t;
    const clamped = Math.max(0, Math.min(t, dur));
    try {
      audio.currentTime = clamped;
      // Ignore stale timeupdate events until the real seek has landed.
      seekGuardRef.current = Date.now();
    } catch {
      /* some WebViews reject seeking before metadata is ready — keep the UI value */
    }
    // Reflect the new position immediately (optimistically) so the lock-screen
    // transport doesn't snap back before the WebView fires timeupdate.
    setCurrentTime(clamped);
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
    if (clamped > 0) {
      if (audio) audio.muted = false;
      setMuted(false);
      try {
        localStorage.setItem(MUTED_KEY, JSON.stringify(false));
      } catch {
        /* storage unavailable */
      }
    }
    try {
      localStorage.setItem(VOLUME_KEY, JSON.stringify(clamped));
    } catch {
      /* storage unavailable */
    }
  }, []);

  const toggleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    const audio = audioRef.current;
    if (audio) {
      audio.muted = next;
      // Volume is the single source of truth for loudness, so mute drives it too.
      audio.volume = next ? 0 : volume;
    }
    try {
      localStorage.setItem(MUTED_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  }, [muted, volume]);


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
        currentIdRef.current = null;
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

  // ---- Media tags --------------------------------------------------------
  const setSongTags = useCallback((id: string, tags: string[]) => {
    setSongs((prev) => {
      const target = prev.find((s) => s.id === id);
      if (!target) return prev;
      const next = { ...target, tags };
      void putSong(next);
      return prev.map((s) => (s.id === id ? next : s));
    });
  }, []);

  // ---- Queue snapshot ----------------------------------------------------
  const saveQueueSnapshot = useCallback(() => {
    if (queue.length === 0) {
      toast.info('队列为空，无法保存快照');
      return;
    }
    const pl: Playlist = {
      id: makePlaylistId(),
      name: `SNAP-${new Date().toISOString().slice(5, 16).replace(/[-T:]/g, '')}`,
      songIds: queue.map((s) => s.id),
      createdAt: Date.now(),
    };
    void putPlaylist(pl);
    setPlaylists((prev) => [...prev, pl]);
    toast.success(`QUEUE SNAPSHOT 已保存：${pl.name}`);
  }, [queue]);

  // ---- Playlists ---------------------------------------------------------

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

  /** Delete every imported / scanned song and drop the device-audio cache.
   *  Bundled preset tracks stay in place, so nothing has to be reloaded. */
  const clearLibrary = useCallback(async () => {
    const all = await getAllSongs();
    const remaining = all.filter((s) => s.id.startsWith('preset:'));
    for (const s of all) {
      if (!s.id.startsWith('preset:')) await deleteSong(s.id);
    }
    clearDeviceAudioCache();
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    audioRef.current?.pause();
    setCurrentId(null);
    setIsPlaying(false);
    // Playback sequences must not keep pointing at songs that no longer exist.
    const kept = new Set(remaining.map((s) => s.id));
    setPlaylists((prev) =>
      prev.map((pl) => {
        const songIds = pl.songIds.filter((id) => kept.has(id));
        if (songIds.length === pl.songIds.length) return pl;
        const next = { ...pl, songIds };
        void putPlaylist(next);
        return next;
      }),
    );
    setSongs(remaining);
    const removed = all.length - remaining.length;
    appendLog(`LIBRARY CLEARED — ${removed} TRACK${removed === 1 ? '' : 'S'} REMOVED`, 'warn');
  }, [appendLog]);

  /** Wipe the library, the sequences and every preference, then restart so the
   *  app comes back exactly like a fresh install (presets included). */
  const clearAllData = useCallback(async () => {
    try {
      await deleteMusicDatabase();
    } catch {
      /* the database may already be gone */
    }
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('endfield-player')) localStorage.removeItem(key);
      }
    } catch {
      /* storage unavailable */
    }
    window.location.reload();
  }, []);

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
    scanLogs,
    spectrum,
    spectrumOn,
    setSpectrumOn,
    setSongTags,
    saveQueueSnapshot,
    importFiles,
    scanDeviceSongs,
    fetchLyricsOnline,
    importLyrics,
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
    clearLibrary,
    clearAllData,
  };

  return (
    <PlayerContext.Provider value={value}>
      {children}
      <MediaSessionBridge />
      <audio
        ref={audioRef}
        // Visually hidden but not display:none — some Android WebView kernels
        // return zeroed analyser data for a display:none media element.
        className="pointer-events-none absolute h-px w-px opacity-0"
        onTimeUpdate={(e) => {
          // Drop timeupdate events that race a just-issued seek (they carry the
          // pre-seek position and would snap the lock-screen scrubber back).
          if (Date.now() - seekGuardRef.current < 400) return;
          setCurrentTime(e.currentTarget.currentTime);
        }}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration || 0)}
        onEnded={handleEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onError={(e) => {
          const el = e.currentTarget;
          const code = el.error?.code ?? 'unknown';
          const src = el.currentSrc || el.src || '';
          toast.error(`音频加载失败（MEDIA_ERR_${code}）：${src.split('/').pop() || '未知源'}`);
        }}
      />
    </PlayerContext.Provider>
  );
}
