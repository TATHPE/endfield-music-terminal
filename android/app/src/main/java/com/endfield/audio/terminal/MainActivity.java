package com.endfield.audio.terminal;

import android.Manifest;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.core.app.ActivityCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final int DARK_BAR = 0xFF0A0A0C; // terminal black
    private static final int LIGHT_BAR = 0xFFF4F4F0; // warm white shell

    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Force edge-to-edge on EVERY Android version (not just 15+): with the
        // decor not fitting the system bars, the status/navigation bar areas are
        // drawn by the WebView itself, so their colors follow the in-app theme
        // (dark shell -> dark bars, light shell -> light bars) purely via CSS.
        // This is the OriginOS 3 / ColorOS / HyperOS / One UI universal fix — no
        // native tinting call can be shadowed by the OS when there is nothing to tint.
        androidx.core.view.WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        // Media notification / lock-screen controls on Android 13+ need POST_NOTIFICATIONS.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(
                        this,
                        new String[] { Manifest.permission.POST_NOTIFICATIONS },
                        1001);
            }
        }
        // Native safety net: read the persisted bg mode straight from the WebView's
        // localStorage and sync the system-bar icon appearance (and bar colors as a
        // fallback for ROMs that ignore decor-fits). Waits for the document to be
        // ready so it never misreads a pre-load state as "dark".
        syncSystemBarsFromStorage();
    }

    @Override
    public void onResume() {
        super.onResume();
        // Re-sync every time the app returns to the foreground (covers orientation
        // changes and OS-level bar resets on OriginOS/HyperOS/ColorOS).
        syncSystemBarsFromStorage();
    }

    private void syncSystemBarsFromStorage() {
        try {
            final WebView wv = getBridge().getWebView();
            if (wv == null) return;
            final int[] attempts = { 0 };
            wv.postDelayed(new Runnable() {
                @Override
                public void run() {
                    attempts[0]++;
                    // Only report a real value once the document is fully loaded;
                    // otherwise (pre-load / about:blank) return null to keep retrying.
                    wv.evaluateJavascript(
                            "(function(){try{ if(document.readyState!=='complete') return 'null'; " +
                                    "return localStorage.getItem('endfield-player:bgmode')||'dark'; }catch(e){return 'null';}})()",
                            value -> {
                                if (value != null && !value.equals("null") && !value.isEmpty()) {
                                    applyBarAppearance(value.contains("light"));
                                } else if (attempts[0] < 24) {
                                    wv.postDelayed(this, 800);
                                }
                            });
                }
            }, 500);
        } catch (Exception e) {
            // WebView not ready yet — safe to skip; the JS bridge will handle it.
        }
    }

    private void applyBarAppearance(boolean light) {
        try {
            Window window = getWindow();
            WindowInsetsControllerCompat controller =
                    WindowCompat.getInsetsController(window, window.getDecorView());
            controller.setAppearanceLightStatusBars(light);
            controller.setAppearanceLightNavigationBars(light);
            // Fallback tint for ROMs that ignore decor-fits; ignored under real
            // edge-to-edge where the WebView paints these areas itself.
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.setStatusBarColor(light ? LIGHT_BAR : DARK_BAR);
            window.setNavigationBarColor(light ? LIGHT_BAR : DARK_BAR);
        } catch (Exception ignored) {
        }
    }
}
