import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import HazardStrip from '@/components/player/HazardStrip';

const BOOT_LINES = [
  { tag: 'BOOT', text: 'TERMINAL BOOT SEQUENCE .......... OK' },
  { tag: 'MEM', text: 'MEMORY CHECK / 0128 TB .......... OK' },
  { tag: 'AUD', text: 'AUDIO DRIVER ................... ONLINE' },
  { tag: 'LINK', text: 'ORIGIN NODE LINK ................ ESTABLISHED' },
];

const BOOT_TIMINGS = [260, 560, 860, 1160, 1500, 2150, 2580];

interface SplashScreenProps {
  onDone: () => void;
}

/** Endfield terminal boot animation shown once on app start. */
export default function SplashScreen({ onDone }: SplashScreenProps) {
  const [lines, setLines] = useState(0);
  const [progress, setProgress] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const timers = [
      setTimeout(() => setLines(1), BOOT_TIMINGS[0]),
      setTimeout(() => setLines(2), BOOT_TIMINGS[1]),
      setTimeout(() => setLines(3), BOOT_TIMINGS[2]),
      setTimeout(() => setLines(4), BOOT_TIMINGS[3]),
      setTimeout(() => setProgress(100), BOOT_TIMINGS[4]),
      setTimeout(() => setFading(true), BOOT_TIMINGS[5]),
      setTimeout(onDone, BOOT_TIMINGS[6]),
    ];
    return () => {
      timers.forEach(clearTimeout);
    };
  }, [onDone]);

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex flex-col items-center justify-between bg-background px-8 py-10 transition-opacity duration-300',
        fading && 'pointer-events-none opacity-0',
      )}
      onClick={onDone}
      role="presentation"
    >
      {/* faint grid + scanlines */}
      <div aria-hidden className="engineering-grid absolute inset-0 opacity-60" />
      <div aria-hidden className="scanlines absolute inset-0" />

      <div className="relative flex w-full items-center justify-between font-mono text-[10px] tracking-[0.2em] text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="blink-dot inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          <span className="text-primary">BOOT</span>
        </span>
        <span>ENDFIELD OS v2.4</span>
      </div>

      {/* Center emblem */}
      <div className="relative flex flex-col items-center gap-6">
        <div className="splash-pulse relative flex h-28 w-28 items-center justify-center">
          {/* hexagon emblem */}
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
            <polygon
              points="50,4 93,27 93,73 50,96 7,73 7,27"
              fill="none"
              stroke="#F2C200"
              strokeWidth="2"
            />
            <polygon
              points="50,18 82,34 82,66 50,82 18,66 18,34"
              fill="none"
              stroke="#F2C200"
              strokeWidth="1"
              opacity="0.45"
            />
            <polygon points="50,32 66,40 66,60 50,68 34,60 34,40" fill="#F2C200" opacity="0.9" />
          </svg>
          <span className="splash-sweep absolute inset-y-0 w-10 bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
        </div>

        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-[0.32em] text-foreground">ENDFIELD</h1>
          <p className="mt-2 font-mono text-[11px] tracking-[0.42em] text-primary">
            AUDIO TERMINAL
          </p>
        </div>

        {/* Boot readouts */}
        <div className="mt-2 flex w-full min-w-[260px] flex-col gap-1.5 font-mono text-[10px] tracking-[0.14em]">
          {BOOT_LINES.map((line, i) => (
            <div
              key={line.tag}
              className={cn(
                'flex items-center justify-between gap-3 transition-opacity duration-150',
                i < lines ? 'opacity-100' : 'opacity-0',
              )}
            >
              <span className={cn('w-10', i < lines ? 'text-primary' : 'text-muted-foreground')}>
                [{line.tag}]
              </span>
              <span className="flex-1 text-right text-foreground/80">{line.text}</span>
              <span className={cn('w-6 text-right', i < lines ? 'text-success' : 'text-muted-foreground')}>
                {i < lines ? 'OK' : '--'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom progress */}
      <div className="relative w-full">
        <HazardStrip className="h-1.5 opacity-70" />
        <div className="mt-3 flex items-center justify-between font-mono text-[9px] tracking-[0.24em] text-muted-foreground">
          <span>INITIALIZING</span>
          <span className="text-primary">{progress}%</span>
        </div>
        <div className="mt-1.5 flex h-1 w-full gap-[2px]">
          {Array.from({ length: 24 }, (_, i) => (
            <span
              key={i}
              className={cn('flex-1', progress >= ((i + 1) / 24) * 100 ? 'bg-primary' : 'bg-foreground/10')}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
