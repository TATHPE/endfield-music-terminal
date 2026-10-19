// EXPORTS: PlaybackGuard, PlaybackGuardPlugin
import { registerPlugin } from '@capacitor/core';

/**
 * Native companion for lock-screen playback: wake lock, audio focus and the
 * headphone-unplug receiver live in PlaybackGuardPlugin.java. No-op on web.
 */
export interface PlaybackGuardPlugin {
  /** Mirror the JS playing state; acquires/releases the wake lock + audio focus. */
  setPlaying(options: { playing: boolean }): Promise<void>;
  /** Open the system battery-optimization screen (user grants manually). */
  openBatterySettings(): Promise<void>;
  addListener(
    eventName: 'interrupted' | 'becomingNoisy',
    listener: () => void,
  ): Promise<{ remove: () => void }>;
}

export const PlaybackGuard = registerPlugin<PlaybackGuardPlugin>('EndfieldPlayback');
