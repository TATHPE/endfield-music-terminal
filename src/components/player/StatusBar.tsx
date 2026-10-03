import { useEffect, useState } from 'react';
import HazardStrip from '@/components/player/HazardStrip';

function SignalBars() {
  return (
    <span aria-hidden className="flex items-end gap-[2px]">
      {[5, 8, 11, 14, 17].map((h, i) => (
        <span
          key={i}
          className="w-[3px] bg-primary/80"
          style={{ height: `${h}px`, opacity: i === 4 ? 0.35 : 0.9 }}
        />
      ))}
    </span>
  );
}

/** Top system status bar — Endfield terminal chrome. */
export default function StatusBar() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const time = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const date = now.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });

  return (
    <header className="pt-safe relative z-30 shrink-0 border-b border-border bg-background/95">
      <div className="flex h-9 items-center justify-between px-3">
        <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] text-foreground/85">
          <span className="blink-dot inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          <span className="text-primary">SYS</span>
          <span className="text-success">ONLINE</span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[10px] tracking-[0.12em] text-foreground/70">
          <span className="hidden text-foreground/50 sm:inline">{date}</span>
          <span>ENDFIELD OS v2.4</span>
          <span className="text-foreground">{time}</span>
          <SignalBars />
        </div>
      </div>
      <div aria-hidden className="h-px w-full bg-primary/40" />
      <HazardStrip className="h-[3px] opacity-50" />
    </header>
  );
}
