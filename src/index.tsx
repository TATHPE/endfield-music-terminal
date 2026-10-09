import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';
import { ErrorFallback } from '@/components/ErrorFallback';
import App from './app';
import './index.css';
import '@fontsource/rajdhani/500.css';
import '@fontsource/rajdhani/600.css';
import '@fontsource/rajdhani/700.css';
import '@fontsource/share-tech-mono/400.css';
import { Capacitor } from '@capacitor/core';
import { StatusBar } from '@capacitor/status-bar';
import { applyTheme, getTheme, applyBgMode, getBgMode, syncSystemBars } from '@/lib/theme';

// Apply the persisted theme & background mode before first paint so the boot screen matches.
applyTheme(getTheme());
applyBgMode(getBgMode()); // also syncs the native system bars via syncSystemBars()

// Ask for persistent storage: IndexedDB holds imported audio blobs, and an
// eviction under storage pressure would silently drop the whole library.
if (navigator.storage?.persist) {
  void navigator.storage.persist().catch(() => undefined);
}

// Web-only offline shell. The native APK must never register a service worker:
// Capacitor already serves every asset from the APK, and a worker there would
// only add a second, stale-able layer in front of the WebView's own loading.
if (
  !Capacitor.isNativePlatform() &&
  import.meta.env.PROD &&
  'serviceWorker' in navigator
) {
  try {
    // Registration is best-effort: offline support must never block boot.
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  } catch {
    // Ignore — some WebViews expose navigator.serviceWorker but reject register.
  }
}

// Edge-to-edge immersive status bar (ColorOS 17 / Android 15+): the web layer reserves
// the top inset via env(safe-area-inset-top); icon style follows the active bg mode.
if (Capacitor.isNativePlatform()) {
  void StatusBar.setOverlaysWebView({ overlay: true });
}

// Re-sync the system bars once the native bridge is guaranteed ready and again
// after React mounts, so the icon appearance lands even if the module-top call
// ran before the bridge was up.
const resync = () => syncSystemBars();
if (Capacitor.isNativePlatform()) {
  window.addEventListener('DOMContentLoaded', resync, { once: true });
}
window.addEventListener('load', resync, { once: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename="/">
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <App />
      </ErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
);
