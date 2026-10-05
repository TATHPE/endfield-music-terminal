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
 * ColorOS 17-style floating dock: frosted-glass capsule with icon + label.
 * The dock floats above the Android system gesture bar (safe-area inset),
 * never touching the screen edge; glass adapts to dark/light backgrounds.
 */
export default function BottomNav({ view, onChange }: BottomNavProps) {
  return (
    <nav
      className="pointer-events-auto shrink-0 pb-[calc(max(env(safe-area-inset-bottom),20px)+16px)] pt-1"
      style={{
        paddingLeft: 'calc(env(safe-area-inset-left) + 12px)',
        paddingRight: 'calc(env(safe-area-inset-right) + 12px)',
      }}
    >
      <div
        className="relative mx-auto flex h-[64px] max-w-[430px] items-center justify-between rounded-[26px] border px-2 backdrop-blur-2xl"
        style={{
          background: 'var(--glass-bg)',
          borderColor: 'var(--glass-border)',
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.07), var(--glass-shadow)',
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
              <span className="flex items-center gap-1">
                {active && (
                  <span className="font-mono text-[7px] tracking-widest text-accent/70">
                    {item.code}
                  </span>
                )}
                <Icon
                  className="h-[21px] w-[21px]"
                  strokeWidth={active ? 2.4 : 1.9}
                  style={active ? { filter: 'drop-shadow(0 0 6px currentColor)' } : undefined}
                />
              </span>
              <span className="text-[9px] font-medium tracking-wider">{item.label}</span>
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
