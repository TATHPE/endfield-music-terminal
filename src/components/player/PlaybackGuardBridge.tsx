// EXPORTS: PlaybackGuardBridge
import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { PlaybackGuard } from '@/lib/playback-guard';
import { usePlayer } from '@/lib/player-context';

/**
 * Mirrors the JS playing state into the native PlaybackGuard so the wake lock
 * follows playback. Interruptions (calls, other apps, headphone unplug) are
 * handled by the WebView's own media pipeline — this bridge must not fight it.
 */
export default function PlaybackGuardBridge() {
  const { isPlaying } = usePlayer();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    void PlaybackGuard.setPlaying({ playing: isPlaying }).catch(() => {});
  }, [isPlaying]);

  return null;
}
