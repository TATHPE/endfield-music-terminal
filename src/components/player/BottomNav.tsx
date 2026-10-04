// EXPORTS: BottomNav
import { Disc3, List, ListMusic, Search, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ViewId } from '@/lib/nav';
import { NAV_ITEMS } from '@/lib/nav';

const ICONS: Record<ViewId, typeof ListMusic> = {
  library: ListMusic,
  playlists: List,
  search: Search,
  nowplaying: Disc3,
  settings: Settings,
};

interface BottomNavProps {
  view: ViewId;
  onChange: (v: ViewId) => void;
}

/**
 * ColorOS 17-style floating dock: frosted-glass capsule, icon-only items,
 * content beneath the dock is blurred through the glass. The center search
 * item shares the same size as every other icon.
 */
export default function BottomNav({ view, onChange }: BottomNavProps) {
  return (
    <nav className="pointer-events-auto shrink-0 px-3 pb-2.5 pt-1">
      <div
        className="relative mx-auto flex h-[58px] max-w-[430px] items-center justify-between rounded-[26px] border border-white/10 bg-[#141418]/60 px-2 backdrop-blur-2xl"
        style={{
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -14px 28px -18px rgba(255,255,255,0.10), 0 12px 32px -10px rgba(0,0,0,0.7)',
        }}
      >
        {NAV_ITEMS.map((item) => {
          const Icon = ICONS[item.id];
          const active = view === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex h-full w-1/5 flex-col items-center justify-center gap-[5px] transition-colors duration-200',
                active ? 'text-accent' : 'text-muted-foreground hover:text-foreground/90',
              )}
            >
              <Icon
                className="h-[22px] w-[22px]"
                strokeWidth={active ? 2.4 : 1.9}
                style={active ? { filter: 'drop-shadow(0 0 6px currentColor)' } : undefined}
              />
              <span
                aria-hidden
                className={cn(
                  'h-[3px] w-[3px] rounded-full transition-all duration-200',
                  active ? 'bg-accent shadow-[0_0_6px] shadow-accent/70' : 'bg-transparent',
                )}
              />
            </button>
          );
        })}
      </div>
    </nav>
  );
}
