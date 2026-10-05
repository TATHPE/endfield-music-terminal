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
        // localStorage and paint the system bars accordingly. This does not depend on
        // the Capacitor plugin bridge timing, so the light-mode status bar is correct
        // even when the JS call ran before the bridge was ready.
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
                    wv.evaluateJavascript(
                            "(function(){try{return localStorage.getItem('endfield-player:bgmode')||'dark'}catch(e){return 'dark'}})()",
                            value -> {
                                if (value != null && !value.equals("null")) {
                                    applyBarColors(value.contains("light"));
                                } else if (attempts[0] < 12) {
                                    wv.postDelayed(this, 500);
                                }
                            });
                }
            }, 400);
        } catch (Exception e) {
            // WebView not ready yet — safe to skip; the JS bridge will handle it.
        }
    }

    private void applyBarColors(boolean light) {
        try {
            Window window = getWindow();
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.setStatusBarColor(light ? LIGHT_BAR : DARK_BAR);
            window.setNavigationBarColor(light ? LIGHT_BAR : DARK_BAR);
            WindowInsetsControllerCompat controller =
                    WindowCompat.getInsetsController(window, window.getDecorView());
            controller.setAppearanceLightStatusBars(light);
            controller.setAppearanceLightNavigationBars(light);
        } catch (Exception ignored) {
        }
    }
}
