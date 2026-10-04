// EXPORTS: MediaSessionBridge
import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { MediaSession } from '@capgo/capacitor-media-session';
import { usePlayer } from '@/lib/player-context';

/** Convert a cover Blob to a data: URL the native side can decode (blob: is unsupported). */
function blobToDataUrl(blob: Blob | null): Promise<string | null> {
  if (!blob) return Promise.resolve(null);
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

/**
 * Bridges the WebView <audio> to the native Android MediaSession:
 * lock-screen artwork / metadata, playback state, position, and
 * notification / hardware media-key actions. No-op on the web.
 */
export default function MediaSessionBridge() {
  const { currentSong, isPlaying, currentTime, duration, togglePlay, playNext, playPrev, seek } =
    usePlayer();

  const native = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();

  // Latest handlers kept in a ref so listeners registered once can call fresh closures.
  const actionsRef = useRef({ togglePlay, playNext, playPrev, seek, currentTime, duration, isPlaying });
  useEffect(() => {
    actionsRef.current = { togglePlay, playNext, playPrev, seek, currentTime, duration, isPlaying };
  });

  // Register lock-screen / hardware key actions once (native only).
  useEffect(() => {
    if (!native) return;
    let cancelled = false;

    const bind = (action: Parameters<typeof MediaSession.setActionHandler>[0]['action'], fn: () => void) => {
      void MediaSession.setActionHandler({ action }, () => {
        if (!cancelled) fn();
      }).catch(() => {});
    };

    bind('play', () => actionsRef.current.togglePlay());
    bind('pause', () => actionsRef.current.togglePlay());
    bind('nexttrack', () => actionsRef.current.playNext());
    bind('previoustrack', () => actionsRef.current.playPrev());
    bind('seekto', (detail?: { position?: number }) => {
      const pos = detail?.position;
      if (typeof pos === 'number' && Number.isFinite(pos)) actionsRef.current.seek(pos);
    });
    bind('seekforward', () => {
      const { seek, currentTime, duration } = actionsRef.current;
      seek(Math.min(duration > 0 ? duration : currentTime + 10, currentTime + 10));
    });
    bind('seekbackward', () => {
      const { seek, currentTime } = actionsRef.current;
      seek(Math.max(0, currentTime - 10));
    });
    bind('stop', () => {
      if (actionsRef.current.isPlaying) actionsRef.current.togglePlay();
    });

    return () => {
      cancelled = true;
    };
  }, [native]);

  // Metadata + artwork whenever the current song changes.
  useEffect(() => {
    if (!native || !currentSong) return;
    let alive = true;
    void (async () => {
      const dataUrl = await blobToDataUrl(currentSong.cover);
      if (!alive) return;
      const artwork = dataUrl
        ? [{ src: dataUrl, sizes: '512x512', type: currentSong.cover?.type || 'image/jpeg' }]
        : [];
      void MediaSession.setMetadata({
        title: currentSong.title,
        artist: currentSong.artist,
        album: currentSong.album,
        artwork,
      }).catch(() => {});
    })();
    return () => {
      alive = false;
    };
  }, [native, currentSong]);

  // Playback state.
  useEffect(() => {
    if (!native || !currentSong) return;
    void MediaSession.setPlaybackState({
      playbackState: isPlaying ? 'playing' : 'paused',
    }).catch(() => {});
  }, [native, isPlaying, currentSong]);

  // Position state, throttled to ~1 Hz while playing.
  useEffect(() => {
    if (!native || !currentSong || duration <= 0) return;
    const push = () => {
      void MediaSession.setPositionState({
        duration,
        position: Math.min(currentTime, duration),
        playbackRate: isPlaying ? 1 : 0,
      }).catch(() => {});
    };
    push();
    if (!isPlaying) return;
    const t = window.setInterval(push, 1000);
    return () => window.clearInterval(t);
  }, [native, currentSong, duration, isPlaying, currentTime]);

  return null;
}
