package com.endfield.audio.terminal;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * EndfieldPlayback — keeps lock-screen / screen-off playback alive.
 *
 * The actual audio element lives in the WebView; this plugin supplies the two
 * native guarantees the WebView cannot provide on its own:
 *   1. a PARTIAL_WAKE_LOCK while playing (the capgo MediaSession service keeps
 *      the process foreground, the wake lock keeps the CPU from sleeping), and
 *   2. audio-focus arbitration — pause on calls / other apps, and on headphone
 *      unplug (ACTION_AUDIO_BECOMING_NOISY).
 *
 * Events pushed to JS: "interrupted" (focus lost) and "becomingNoisy".
 * MainActivity also reads {@link #isPlaying()} to decide whether onPause may
 * pause the WebView (it must not, or audio stops when the screen turns off).
 */
@CapacitorPlugin(name = "EndfieldPlayback")
public class PlaybackGuardPlugin extends Plugin {

    private static volatile boolean playing = false;

    private PowerManager.WakeLock wakeLock;
    private AudioManager audioManager;
    /**
     * android.media.AudioFocusRequest (API 26+), kept as Object so this class can
     * still be verified/loaded on minSdk 24 devices.
     */
    private Object focusRequest;
    private boolean noisyRegistered = false;

    private final AudioManager.OnAudioFocusChangeListener focusListener = focusChange -> {
        if (focusChange == AudioManager.AUDIOFOCUS_LOSS
                || focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT
                || focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) {
            // Let the web player pause itself (it owns the <audio> element).
            notifyListeners("interrupted", null);
        }
    };

    private final BroadcastReceiver noisyReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent != null && AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction())) {
                notifyListeners("becomingNoisy", null);
            }
        }
    };

    /** Read by MainActivity.onPause(): true = keep the WebView media pipeline alive. */
    public static boolean isPlaying() {
        return playing;
    }

    @PluginMethod
    public void setPlaying(PluginCall call) {
        boolean next = Boolean.TRUE.equals(call.getBoolean("playing", false));
        playing = next;
        if (next) {
            acquireWakeLock();
            requestFocus();
            registerNoisy();
        } else {
            releaseWakeLock();
            abandonFocus();
            unregisterNoisy();
        }
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
        abandonFocus();
        unregisterNoisy();
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

    private void requestFocus() {
        try {
            if (audioManager == null) {
                audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            }
            if (audioManager == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (focusRequest == null) {
                    focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                            .setAudioAttributes(new AudioAttributes.Builder()
                                    .setUsage(AudioAttributes.USAGE_MEDIA)
                                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                                    .build())
                            .setOnAudioFocusChangeListener(focusListener)
                            .build();
                }
                audioManager.requestAudioFocus((AudioFocusRequest) focusRequest);
            } else {
                audioManager.requestAudioFocus(
                        focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
            }
        } catch (Exception ignored) {
        }
    }

    private void abandonFocus() {
        try {
            if (audioManager == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (focusRequest != null) {
                    audioManager.abandonAudioFocusRequest((AudioFocusRequest) focusRequest);
                }
            } else {
                audioManager.abandonAudioFocus(focusListener);
            }
        } catch (Exception ignored) {
        }
    }

    private void registerNoisy() {
        if (noisyRegistered) return;
        try {
            IntentFilter filter = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                getContext().registerReceiver(noisyReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
            } else {
                getContext().registerReceiver(noisyReceiver, filter);
            }
            noisyRegistered = true;
        } catch (Exception ignored) {
        }
    }

    private void unregisterNoisy() {
        if (!noisyRegistered) return;
        try {
            getContext().unregisterReceiver(noisyReceiver);
        } catch (Exception ignored) {
        }
        noisyRegistered = false;
    }
}
