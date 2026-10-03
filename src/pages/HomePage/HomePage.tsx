import { useState } from 'react';
import type { ViewId } from '@/lib/nav';
import PlayerProvider from '@/components/player/PlayerProvider';
import StatusBar from '@/components/player/StatusBar';
import BottomNav from '@/components/player/BottomNav';
import MiniPlayer from '@/components/player/MiniPlayer';
import LibraryView from '@/components/player/LibraryView';
import NowPlayingView from '@/components/player/NowPlayingView';
import SplashScreen from '@/components/player/SplashScreen';

/**
 * Mobile-first Endfield-style music terminal.
 * The app shell is phone-sized (max 430px) and centered on larger screens.
 */
export default function HomePage() {
  const [view, setView] = useState<ViewId>('library');
  const [booted, setBooted] = useState(false);

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
          <main className="scanlines relative flex-1 overflow-y-auto">
            {view === 'library' ? <LibraryView /> : <NowPlayingView />}
          </main>
          {view !== 'nowplaying' && <MiniPlayer onOpen={() => setView('nowplaying')} />}
          <BottomNav view={view} onChange={setView} />
          {!booted && <SplashScreen onDone={() => setBooted(true)} />}
        </div>
      </div>
    </PlayerProvider>
  );
}
