package com.endfield.audio.terminal;

import android.os.Build;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * EndfieldSystemBars — sync status/navigation bar appearance with the in-app theme.
 *
 * NOTE: registered under a UNIQUE name ("EndfieldSystemBars") on purpose — Capacitor
 * ships its own com.getcapacitor.plugin.SystemBars (id "SystemBars", methods
 * setStyle/show/hide only). A duplicate "SystemBars" id would shadow it and make
 * setAppearance route nowhere. See Bridge.registerAllPlugins().
 *
 * targetSdk 36 (Android 15/16) enforces edge-to-edge: system bar backgrounds are
 * transparent and ignored, so only icon appearance (light/dark) can be driven.
 * On Android 7-14 we also paint the bar backgrounds to match the active theme.
 *
 * ColorOS / HyperOS / OriginOS / HarmonyOS / One UI all share this behavior.
 * OriginOS 3 additionally ignores WindowInsetsControllerCompat in some builds,
 * so we ALSO drive the legacy setSystemUiVisibility flags (light status bar)
 * as a second channel — harmless on API 30+, effective on older ROMs.
 */
@CapacitorPlugin(name = "EndfieldSystemBars")
public class SystemBarsPlugin extends Plugin {

    private static final int DARK_BAR = 0xFF0A0A0C; // terminal black
    private static final int LIGHT_BAR = 0xFFF4F4F0; // warm white shell

    @PluginMethod
    public void setAppearance(PluginCall call) {
        Boolean lightStatus = call.getBoolean("lightStatus", false);
        Boolean lightNav = call.getBoolean("lightNav", false);

        getBridge().executeOnMainThread(() -> {
            try {
                Window window = getActivity().getWindow();
                WindowInsetsControllerCompat controller =
                        WindowCompat.getInsetsController(window, window.getDecorView());
                controller.setAppearanceLightStatusBars(Boolean.TRUE.equals(lightStatus));
                controller.setAppearanceLightNavigationBars(Boolean.TRUE.equals(lightNav));

                // Paint the bar backgrounds on EVERY version. On Android 15+
                // (enforced edge-to-edge) the system officially ignores the color
                // and the WebView paints the area itself — but some ColorOS /
                // HyperOS / OriginOS builds still respect it or fall back to a
                // black bar when transparent is left untouched, so setting the
                // color unconditionally is the safe cross-ROM fix.
                window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
                window.setStatusBarColor(Boolean.TRUE.equals(lightStatus) ? LIGHT_BAR : DARK_BAR);
                window.setNavigationBarColor(Boolean.TRUE.equals(lightNav) ? LIGHT_BAR : DARK_BAR);

                // Legacy channel (OriginOS 3 / old ColorOS ignore the controller).
                View decor = window.getDecorView();
                int flags = 0;
                if (Boolean.TRUE.equals(lightStatus)) flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                if (Build.VERSION.SDK_INT >= 26 && Boolean.TRUE.equals(lightNav)) {
                    flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                }
                decor.setSystemUiVisibility(flags);
                call.resolve();
            } catch (Exception e) {
                call.reject("Failed to apply system bar appearance: " + e.getMessage());
            }
        });
    }
}
