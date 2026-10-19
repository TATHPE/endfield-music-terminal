// EXPORTS: PlaybackGuardBridge
import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { PlaybackGuard } from '@/lib/playback-guard';
import { usePlayer } from '@/lib/player-context';

/**
 * Mirrors the JS playing state into the native PlaybackGuard (wake lock, audio
 * focus, noisy receiver) and turns native interruptions into a pause. The
 * <audio> element itself stays in the WebView.
 */
export default function PlaybackGuardBridge() {
  const { isPlaying, togglePlay } = usePlayer();
  const playingRef = useRef(isPlaying);
  const toggleRef = useRef(togglePlay);

  useEffect(() => {
    toggleRef.current = togglePlay;
  }, [togglePlay]);

  useEffect(() => {
    playingRef.current = isPlaying;
    if (!Capacitor.isNativePlatform()) return;
    void PlaybackGuard.setPlaying({ playing: isPlaying }).catch(() => {});
  }, [isPlaying]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const pause = () => {
      if (playingRef.current) toggleRef.current();
    };
    const subs = [
      PlaybackGuard.addListener('interrupted', pause),
      PlaybackGuard.addListener('becomingNoisy', pause),
    ];
    return () => {
      for (const sub of subs) void sub.then((handle) => handle.remove());
    };
  }, []);

  return null;
}
