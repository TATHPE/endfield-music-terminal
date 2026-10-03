interface CornerFrameProps {
  className?: string;
  size?: string;
}

/** Four corner brackets — the Endfield terminal framing mark. */
export default function CornerFrame({ className = '', size = 'h-3.5 w-3.5' }: CornerFrameProps) {
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 ${className}`}>
      <span className={`absolute left-0 top-0 ${size} border-l-2 border-t-2 border-primary/80`} />
      <span className={`absolute right-0 top-0 ${size} border-r-2 border-t-2 border-primary/80`} />
      <span className={`absolute bottom-0 left-0 ${size} border-b-2 border-l-2 border-primary/80`} />
      <span className={`absolute bottom-0 right-0 ${size} border-b-2 border-r-2 border-primary/80`} />
    </div>
  );
}
