// EXPORTS: PlaybackGuard, PlaybackGuardPlugin
import { registerPlugin } from '@capacitor/core';

/**
 * Native companion for lock-screen playback: a wake lock plus the battery
 * optimization guide live in PlaybackGuardPlugin.java. No-op on web.
 *
 * NOTE: this plugin intentionally does not touch audio focus — the WebView's
 * media pipeline already owns it.
 */
export interface PlaybackGuardPlugin {
  /** Mirror the JS playing state; acquires/releases the wake lock. */
  setPlaying(options: { playing: boolean }): Promise<void>;
  /** Open the system battery-optimization screen (user grants manually). */
  openBatterySettings(): Promise<void>;
  /** Ask the system to exempt this app from battery optimisation (OriginOS 6). */
  requestIgnoreBatteryOptimizations(): Promise<void>;
}

export const PlaybackGuard = registerPlugin<PlaybackGuardPlugin>('EndfieldPlayback');
