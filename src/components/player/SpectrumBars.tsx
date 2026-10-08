// EXPORTS: SpectrumBars
/** Live 24-bucket frequency readout fed by the provider's AnalyserNode.
 *  Each bar height scales with the bucket value; render is cheap and purely
 *  visual — never touches playback state.
 *  The root must claim the row's remaining width (w-full min-w-0): without
 *  it the flex-1 bars collapse to zero width inside an auto-width flex item
 *  and the readout renders completely blank. */
export default function SpectrumBars({ data }: { data: number[] }) {
  if (!data || data.length === 0) return null;
  return (
    <div className="flex h-6 min-w-0 flex-1 items-end gap-[2px] px-1" aria-hidden>
      {data.map((v, i) => {
        const r = Math.min(1, Math.max(0, v / 255));
        return (
          <span
            key={i}
            className="flex-1 bg-primary/70"
            style={{
              height: `${Math.max(8, r * 100)}%`,
              opacity: 0.4 + r * 0.6,
            }}
          />
        );
      })}
    </div>
  );
}
