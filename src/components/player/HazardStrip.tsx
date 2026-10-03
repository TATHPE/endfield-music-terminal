interface HazardStripProps {
  className?: string;
}

/** Endfield signature yellow/black hazard stripe divider. */
export default function HazardStrip({ className = '' }: HazardStripProps) {
  return <div aria-hidden className={`hazard-stripe h-1.5 w-full ${className}`} />;
}
