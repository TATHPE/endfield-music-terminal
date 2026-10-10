import { useEffect, useRef, useState, useSyncExternalStore, type TouchEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ViewId } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { LABELS } from '@/lib/strings';
import { syncSystemBars } from '@/lib/theme';
import { getConfigSnapshot, subscribeTerminalConfig } from '@/lib/terminal-config';
import PlayerProvider from '@/components/player/PlayerProvider';
import StatusBar from '@/components/player/StatusBar';
import BottomNav from '@/components/player/BottomNav';
import MiniPlayer from '@/components/player/MiniPlayer';
import LibraryView from '@/components/player/LibraryView';
import PlaylistsView from '@/components/player/PlaylistsView';
import SearchView from '@/components/player/SearchView';
import NowPlayingView from '@/components/player/NowPlayingView';
import SettingsView from '@/components/player/SettingsView';
import SplashScreen from '@/components/player/SplashScreen';

const VIEW_ORDER: ViewId[] = ['library', 'playlists', 'search', 'nowplaying', 'settings'];

/** Short square-wave blip for dock taps when terminal beep is enabled. */
function playBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.07);
    osc.onended = () => void ctx.close();
  } catch {
    /* audio unavailable */
  }
}

/**
 * Mobile-first Endfield-style music terminal.
 * The app shell is phone-sized (max 430px) and centered on larger screens.
 * Swipe left/right on the main area to switch between the three tabs.
 */
export default function HomePage() {
  const [view, setView] = useState<ViewId>('library');
  const [dir, setDir] = useState<1 | -1>(1);
  const [booted, setBooted] = useState(false);
  const [idleDim, setIdleDim] = useState(false);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const cfg = useSyncExternalStore(subscribeTerminalConfig, getConfigSnapshot);
  const idleTimerRef = useRef<number | null>(null);

  // Final safety net: after React mounts the bridge is definitely ready, so
  // re-push the system bar appearance to match the active background mode.
  useEffect(() => {
    syncSystemBars();
  }, []);

  // Idle dimmer: with idleMinutes > 0 the shell fades to a standby readout
  // after N minutes of no pointer/touch activity; any tap wakes it.
  useEffect(() => {
    const idleMs = cfg.idleMinutes * 60 * 1000;
    if (!idleMs) return;
    const arm = () => {
      setIdleDim(false);
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = window.setTimeout(() => setIdleDim(true), idleMs);
    };
    arm();
    const wake = () => arm();
    window.addEventListener('pointerdown', wake);
    window.addEventListener('pointermove', wake);
    return () => {
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('pointermove', wake);
    };
  }, [cfg.idleMinutes]);

  const go = (v: ViewId) => {
    const cur = VIEW_ORDER.indexOf(view);
    const nxt = VIEW_ORDER.indexOf(v);
    if (cur !== nxt) setDir(nxt > cur ? 1 : -1);
    if (cfg.beepOn) playBeep();
    setView(v);
  };

  const handleTouchStart = (e: TouchEvent) => {
    // 手势起点落在滑块类控件上时，整段手势都不参与翻页判定。
    // 否则拖动进度条/音量条（本身就是横向位移）会被当成左右滑动而意外切页。
    const el = e.target as HTMLElement | null;
    if (el && typeof el.closest === 'function' && el.closest('[role="slider"], input[type="range"], [data-no-swipe]')) {
      swipeStart.current = null;
      return;
    }
    const t = e.touches[0];
    swipeStart.current = { x: t.clientX, y: t.clientY };
  };

  const handleTouchEnd = (e: TouchEvent) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    // 横向占优且超过阈值才翻页；纵向滚动、轻微抖动都忽略
    if (Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const idx = VIEW_ORDER.indexOf(view);
    if (dx < 0 && idx < VIEW_ORDER.length - 1) go(VIEW_ORDER[idx + 1]);
    else if (dx > 0 && idx > 0) go(VIEW_ORDER[idx - 1]);
  };

  return (
    <PlayerProvider>
      <div className="engineering-grid fixed inset-0 flex w-full justify-center bg-background">
        {/* Desktop-side backdrop marks */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 hidden select-none items-center justify-center lg:flex"
        >
          <span className="rotate-90 font-mono text-[11px] tracking-[0.7em] text-foreground/20">
            ENDFIELD AUDIO TERMINAL — LOCAL NODE
          </span>
        </div>

        <div className="relative flex h-full w-full max-w-[430px] flex-col overflow-hidden border-x border-border/70 bg-background">
          <StatusBar />
          {/* light layer of the dual-tone player background */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[38%] bg-[radial-gradient(130%_100%_at_50%_-18%,var(--bg-glow),transparent_70%)]"
          />
          <main
            className={cn(
              'relative z-[1] min-h-0 flex-1 overflow-hidden',
              cfg.scanlinesOn && 'bg-scan-anim scanlines',
            )}
            style={cfg.scanlinesOn ? { animationDuration: `${cfg.scanSpeed}s` } : undefined}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={view}
                initial={{ opacity: 0, x: dir * 26 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: dir * -26 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className={
                  view === 'nowplaying'
                    ? /* fixed page: bottom padding = dock height, so every
                         control lives strictly above the floating dock */
                      'h-full overflow-hidden pb-[124px]'
                    : view === 'settings'
                      ? /* scrollable page: padding still covers BOTH the floating
                           MiniPlayer and the dock, but the content may scroll, so
                           new settings rows never squeeze the controls */
                        'h-full overflow-y-auto pb-[182px]'
                      : /* browse pages: content scrolls behind the frosted
                           dock and shows through it blurred; bottom padding
                           still lets the last row rest above the dock buttons */
                        'h-full overflow-y-auto pb-[160px]'
                }
              >
                {view === 'library' ? (
                  <LibraryView />
                ) : view === 'playlists' ? (
                  <PlaylistsView />
                ) : view === 'search' ? (
                  <SearchView />
                ) : view === 'nowplaying' ? (
                  <NowPlayingView />
                ) : (
                  <SettingsView />
                )}
              </motion.div>
            </AnimatePresence>
          </main>
          {/* floating frosted bottom layer: browse content scrolls behind it
              and shows through blurred; mini player only outside the
              now-playing view */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col gap-1.5">
            <AnimatePresence>
              {view !== 'nowplaying' && (
                <div className="pointer-events-auto">
                  <MiniPlayer onOpen={() => go('nowplaying')} />
                </div>
              )}
            </AnimatePresence>
            <BottomNav view={view} onChange={go} />
          </div>
          {!booted && <SplashScreen onDone={() => setBooted(true)} />}

          {/* Idle standby dimmer */}
          {idleDim && (
            <button
              type="button"
              onClick={() => setIdleDim(false)}
              className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-2 bg-background/90 font-mono"
              aria-label={LABELS.WAKE_TERMINAL}
            >
              <span className="block-cursor inline-block h-4 w-2 bg-primary" />
              <span className="text-xs tracking-[0.4em] text-foreground/80">AWAITING INPUT</span>
              <span className="text-[9px] tracking-[0.3em] text-muted-foreground">
                TERMINAL STANDBY — 点击唤醒
              </span>
            </button>
          )}
        </div>
      </div>
    </PlayerProvider>
  );
}
