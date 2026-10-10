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
        // Register the app's own native plugins BEFORE super.onCreate: Capacitor's
        // BridgeActivity.onCreate internally calls load() which builds the Bridge
        // from the plugin list captured at that moment. registerPlugin() only
        // appends to the builder, so calling it after super.onCreate means the
        // plugin never reaches the Bridge and JS gets
        // "X plugin is not implemented on android".
        registerPlugin(SystemBarsPlugin.class);
        registerPlugin(MediaScannerPlugin.class);
        // 在线流的原生取流通道：WebView 的 fetch 必带 Origin，会被电台热链保护
        // 回 403；这条通道自己发请求、把字节推给现有 MSE 播放器。
        registerPlugin(StreamFetcherPlugin.class);
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

        // HyperOS / OriginOS / ColorOS all force-dark WebView content when the
        // system dark mode is on, which fights the app's own theme (light shell
        // turns black, terminal colors get inverted). The app paints everything
        // itself, so disable the ROM-level force-dark entirely. Use the
        // androidx.webkit compat layer instead of the raw platform API — the
        // platform methods were added in API 29/33 and the compat path is a
        // safe no-op on older devices (minSdk 24).
        try {
            android.webkit.WebSettings ws = getBridge().getWebView().getSettings();
            if (androidx.webkit.WebViewFeature.isFeatureSupported(
                    androidx.webkit.WebViewFeature.FORCE_DARK)) {
                androidx.webkit.WebSettingsCompat.setForceDark(
                        ws, androidx.webkit.WebSettingsCompat.FORCE_DARK_OFF);
            }
        } catch (Exception ignored) {
            // WebView not attached yet — harmless; default stays until JS paints.
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        // Re-sync every time the app returns to the foreground (covers orientation
        // changes and OS-level bar resets on OriginOS/HyperOS/ColorOS).
        syncSystemBarsFromStorage();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        // Media scan permission: route the dialog outcome straight to the plugin
        // (Capacitor's own permission callback path can fail to show the dialog on
        // some ROMs, so the request itself is issued via plain ActivityCompat).
        if (requestCode == MediaScannerPlugin.REQ_AUDIO) {
            // Accept if ANY requested permission came back granted (we ask for both
            // READ_MEDIA_AUDIO and the legacy READ_EXTERNAL_STORAGE because ROMs
            // like OriginOS may grant either one in their permission dialog).
            boolean granted = false;
            if (grantResults != null) {
                for (int g : grantResults) {
                    if (g == PackageManager.PERMISSION_GRANTED) {
                        granted = true;
                        break;
                    }
                }
            }
            MediaScannerPlugin.notifyPermissionResult(granted);
            return;
        }
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
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
            // Legacy channel: OriginOS 3 / old ColorOS ignore the controller,
            // so drive the deprecated flags as a second path (no-op on 30+).
            int flags = 0;
            if (light) flags |= android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            if (Build.VERSION.SDK_INT >= 26 && light) {
                flags |= android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            }
            window.getDecorView().setSystemUiVisibility(flags);
        } catch (Exception ignored) {
        }
    }
}
