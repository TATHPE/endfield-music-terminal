package com.endfield.audio.terminal;

import android.content.Context;
import android.content.Intent;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * EndfieldPlayback — keeps lock-screen / screen-off playback alive.
 *
 * Deliberately does NOT request AudioManager audio focus: the WebView's own
 * media pipeline (Chromium) already owns focus for the <audio> element, and a
 * second AUDIOFOCUS_GAIN request from the same app sends LOSS to Chromium and
 * pauses playback. Chromium also handles calls / other apps / headphone unplug
 * on its own, so this plugin only adds a WakeLock plus the battery-optimization
 * guide.
 */
@CapacitorPlugin(name = "EndfieldPlayback")
public class PlaybackGuardPlugin extends Plugin {

    private static volatile boolean playing = false;

    private PowerManager.WakeLock wakeLock;

    /** Read by MainActivity.onPause(): true = keep the WebView media pipeline alive. */
    public static boolean isPlaying() {
        return playing;
    }

    @PluginMethod
    public void setPlaying(PluginCall call) {
        boolean next = Boolean.TRUE.equals(call.getBoolean("playing", false));
        playing = next;
        if (next) acquireWakeLock();
        else releaseWakeLock();
        call.resolve();
    }

    /** Open the system battery-optimization screen (guide, never auto-grant). */
    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("无法打开电池优化设置", e);
        }
    }

    @Override
    protected void handleOnDestroy() {
        playing = false;
        releaseWakeLock();
        super.handleOnDestroy();
    }

    private void acquireWakeLock() {
        try {
            if (wakeLock == null) {
                PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
                if (pm == null) return;
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Endfield::Playback");
                wakeLock.setReferenceCounted(false);
            }
            if (!wakeLock.isHeld()) wakeLock.acquire();
        } catch (Exception ignored) {
            // A missing wake lock must never break playback.
        }
    }

    private void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (Exception ignored) {
        }
    }
}
