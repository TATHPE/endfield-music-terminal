import { useRef } from 'react';
import { cn } from '@/lib/utils';

interface ProgressBarProps {
  /** seconds */
  value: number;
  /** seconds */
  max: number;
  onSeek: (t: number) => void;
  disabled?: boolean;
  className?: string;
}

const SEGMENTS = 26;

/**
 * Endfield-style segmented progress readout.
 * Draggable via pointer events; segments fill from the left.
 */
export default function ProgressBar({ value, max, onSeek, disabled = false, className = '' }: ProgressBarProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const filled = Math.round(ratio * SEGMENTS);

  const seekFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el || max <= 0 || disabled) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const r = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onSeek(r * max);
  };

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(value)}
      aria-label="播放进度"
      className={cn(
        'group relative flex h-5 cursor-pointer touch-none items-center',
        disabled && 'cursor-default opacity-60',
        className,
      )}
      onPointerDown={(e) => {
        if (disabled) return;
        draggingRef.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        seekFromClientX(e.clientX);
      }}
      onPointerMove={(e) => {
        if (draggingRef.current) seekFromClientX(e.clientX);
      }}
      onPointerUp={() => {
        draggingRef.current = false;
      }}
      onPointerCancel={() => {
        draggingRef.current = false;
      }}
    >
      <div className="relative flex h-1.5 w-full gap-[1px]">
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span
            key={i}
            className={cn('flex-1', i < filled ? 'bg-primary' : 'bg-foreground/12')}
          />
        ))}
        {/* drag handle */}
        <span
          className={cn(
            'absolute top-1/2 h-3.5 w-1 -translate-y-1/2 bg-foreground/90 transition-opacity group-hover:opacity-100',
            filled > 0 ? 'opacity-100' : 'opacity-0',
          )}
          style={{ left: `calc(${ratio * 100}% - 2px)` }}
        />
      </div>
    </div>
  );
}
