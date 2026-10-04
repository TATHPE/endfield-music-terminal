import { useEffect, useMemo } from 'react';
import { Music } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CoverArtProps {
  cover: Blob | null;
  title: string;
  className?: string;
  /** show corner brackets overlay */
  framed?: boolean;
  /** playing: animate scan line + rotating engineering ring */
  playing?: boolean;
}

/**
 * Album artwork. Object URL is derived during render (official React pattern)
 * and revoked on cleanup; falls back to an Endfield hazard placeholder.
 * When playing, a scan line sweeps the artwork and an engineering ring rotates.
 */
export default function CoverArt({ cover, title, className = '', framed = false, playing = false }: CoverArtProps) {
  const url = useMemo(() => (cover ? URL.createObjectURL(cover) : null), [cover]);

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  return (
    <div
      className={cn(
        'clip-corner-sm relative shrink-0 overflow-hidden bg-card',
        framed && 'border border-border/80',
        className,
      )}
    >
      {url ? (
        <img
          src={url}
          alt={`${title} 专辑封面`}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="relative flex h-full w-full items-center justify-center">
          <div aria-hidden className="hazard-stripe absolute inset-0 opacity-15" />
          <Music className="h-1/3 w-1/3 text-primary/80" strokeWidth={1.5} />
          <span aria-hidden className="absolute left-0 top-0 h-2 w-2 border-l-2 border-t-2 border-primary/60" />
          <span aria-hidden className="absolute bottom-0 right-0 h-2 w-2 border-b-2 border-r-2 border-primary/60" />
        </div>
      )}

      {/* Playing feedback: rotating engineering ring */}
      {playing && (
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-[7%] rounded-full border border-dashed border-primary/45"
        >
          <span className="art-ring absolute inset-0">
            <span className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 bg-primary shadow-[0_0_6px_rgba(242,194,0,0.9)]" />
          </span>
        </div>
      )}

      {/* Playing feedback: scan line sweeping down the artwork */}
      {playing && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 h-[3px]"
        >
          <div className="art-scan absolute inset-x-0 h-full bg-gradient-to-r from-transparent via-primary/80 to-transparent" />
        </div>
      )}

      {framed && (
        <div aria-hidden className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_1px_rgba(10,10,12,0.4)]" />
      )}
    </div>
  );
}
