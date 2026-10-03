interface EqBarsProps {
  className?: string;
  barClass?: string;
}

/** Animated equalizer bars shown on the currently playing track. */
export default function EqBars({ className = '', barClass = '' }: EqBarsProps) {
  return (
    <div aria-hidden className={`flex h-3 items-end gap-[2px] ${className}`}>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={`eq-bar w-[3px] bg-primary ${barClass}`}
          style={{ animationDelay: `${i * 0.14}s` }}
        />
      ))}
    </div>
  );
}
