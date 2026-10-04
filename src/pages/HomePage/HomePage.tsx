import { useRef, useState, type TouchEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ViewId } from '@/lib/nav';
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

/**
 * Mobile-first Endfield-style music terminal.
 * The app shell is phone-sized (max 430px) and centered on larger screens.
 * Swipe left/right on the main area to switch between the three tabs.
 */
export default function HomePage() {
  const [view, setView] = useState<ViewId>('library');
  const [dir, setDir] = useState<1 | -1>(1);
  const [booted, setBooted] = useState(false);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  const go = (v: ViewId) => {
    const cur = VIEW_ORDER.indexOf(view);
    const nxt = VIEW_ORDER.indexOf(v);
    if (cur !== nxt) setDir(nxt > cur ? 1 : -1);
    setView(v);
  };

  const handleTouchStart = (e: TouchEvent) => {
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
    // horizontal-dominant swipe past threshold; ignore vertical scrolls
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    const idx = VIEW_ORDER.indexOf(view);
    if (dx < 0 && idx < VIEW_ORDER.length - 1) go(VIEW_ORDER[idx + 1]);
    else if (dx > 0 && idx > 0) go(VIEW_ORDER[idx - 1]);
  };

  return (
    <PlayerProvider>
      <div className="engineering-grid flex min-h-dvh w-full justify-center bg-black">
        {/* Desktop-side backdrop marks */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 hidden select-none items-center justify-center lg:flex"
        >
          <span className="rotate-90 font-mono text-[11px] tracking-[0.7em] text-foreground/20">
            ENDFIELD AUDIO TERMINAL — LOCAL NODE
          </span>
        </div>

        <div className="relative flex h-dvh w-full max-w-[430px] flex-col overflow-hidden border-x border-border/70 bg-background">
          <StatusBar />
          {/* light layer of the dual-tone player background */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[38%] bg-[radial-gradient(130%_100%_at_50%_-18%,var(--bg-glow),transparent_70%)]"
          />
          <main
            className="scanlines relative z-[1] flex-1 overflow-hidden"
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
                className="h-full overflow-y-auto pb-[158px]"
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
          {/* floating frosted bottom layer: mini player + dock */}
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
        </div>
      </div>
    </PlayerProvider>
  );
}
