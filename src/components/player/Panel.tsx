import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import CornerFrame from '@/components/player/CornerFrame';

interface PanelProps {
  children: ReactNode;
  className?: string;
  /** top accent line color — primary (yellow) or neutral */
  accent?: 'primary' | 'neutral';
}

/** Clipped-corner terminal panel with corner brackets. */
export default function Panel({ children, className = '', accent = 'primary' }: PanelProps) {
  return (
    <div
      className={cn(
        'clip-corner-sm relative border border-border/80 bg-card/85',
        className,
      )}
    >
      <div
        aria-hidden
        className={cn(
          'absolute left-0 top-0 h-px w-full',
          accent === 'primary' ? 'bg-primary/70' : 'bg-foreground/20',
        )}
      />
      {children}
      <CornerFrame className="opacity-60" size="h-2.5 w-2.5" />
    </div>
  );
}
