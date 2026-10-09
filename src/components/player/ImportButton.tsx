import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ACTIONS } from '@/lib/strings';

interface ImportButtonProps {
  onClick: () => void;
  className?: string;
  large?: boolean;
}

/** Endfield-style clipped import trigger with hazard stripe accent. */
export default function ImportButton({ onClick, className = '', large = false }: ImportButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'clip-corner-sm group relative flex shrink-0 items-center gap-2 border border-primary/60 bg-primary text-primary-foreground font-semibold transition-colors hover:bg-primary/90',
        large ? 'px-5 py-3 text-base' : 'px-3.5 py-2 text-sm',
        className,
      )}
    >
      <span aria-hidden className="hazard-stripe absolute inset-x-0 bottom-0 h-[3px] opacity-70" />
      <Plus className={large ? 'h-5 w-5' : 'h-4 w-4'} strokeWidth={2.6} />
      {ACTIONS.IMPORT}
    </button>
  );
}
