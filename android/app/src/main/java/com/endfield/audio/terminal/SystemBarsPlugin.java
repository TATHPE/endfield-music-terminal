package com.endfield.audio.terminal;

import android.os.Build;
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
 * SystemBars — sync status/navigation bar appearance with the in-app theme.
 *
 * targetSdk 36 (Android 15/16) enforces edge-to-edge: system bar backgrounds are
 * transparent and ignored, so only icon appearance (light/dark) can be driven.
 * On Android 7-14 we also paint the bar backgrounds to match the active theme.
 *
 * ColorOS / HyperOS / OriginOS / HarmonyOS / One UI all share this behavior.
 */
@CapacitorPlugin(name = "SystemBars")
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

                // Android < 15: edge-to-edge is not enforced, paint bar backgrounds
                // so icons stay readable on both dark and light shells.
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) {
                    window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
                    window.setStatusBarColor(Boolean.TRUE.equals(lightStatus) ? LIGHT_BAR : DARK_BAR);
                    window.setNavigationBarColor(Boolean.TRUE.equals(lightNav) ? LIGHT_BAR : DARK_BAR);
                }
                call.resolve();
            } catch (Exception e) {
                call.reject("Failed to apply system bar appearance: " + e.getMessage());
            }
        });
    }
}
