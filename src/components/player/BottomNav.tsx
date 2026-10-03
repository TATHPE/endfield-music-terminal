import { Disc3, ListMusic } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ViewId } from '@/lib/nav';
import { NAV_ITEMS } from '@/lib/nav';

const ICONS: Record<ViewId, typeof ListMusic> = {
  library: ListMusic,
  nowplaying: Disc3,
};

interface BottomNavProps {
  view: ViewId;
  onChange: (v: ViewId) => void;
}

/** Bottom tab navigation — two terminal entries. */
export default function BottomNav({ view, onChange }: BottomNavProps) {
  return (
    <nav className="pb-safe relative z-30 shrink-0 border-t border-border bg-background/95">
      <div aria-hidden className="h-px w-full bg-primary/30" />
      <div className="grid grid-cols-2">
        {NAV_ITEMS.map((item) => {
          const Icon = ICONS[item.id];
          const active = view === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={cn(
                'flex flex-col items-center gap-0.5 px-2 py-2.5 font-mono text-[10px] tracking-widest transition-colors',
                active
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <span className="flex items-center gap-1.5">
                <span className={cn('text-[9px]', active ? 'text-primary' : 'text-foreground/35')}>
                  {item.code}
                </span>
                <Icon className="h-4 w-4" strokeWidth={active ? 2.4 : 1.8} />
              </span>
              <span className={cn('text-[11px]', active ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                {item.label}
              </span>
              <span
                aria-hidden
                className={cn('mt-0.5 h-0.5 w-8 transition-colors', active ? 'bg-primary' : 'bg-transparent')}
              />
            </button>
          );
        })}
      </div>
    </nav>
  );
}
