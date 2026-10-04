// EXPORTS: LrcLine, LrcResult, parseLrc, lrcToPlain

export interface LrcLine {
  /** seconds from track start */
  time: number;
  text: string;
}

export type LrcResult =
  | { kind: 'timed'; lines: LrcLine[] }
  | { kind: 'plain'; text: string }
  | null;

/** [mm:ss.xx] / [mm:ss:xx] / [mm:ss] — one or more timestamps per line. */
const TIME_RE = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

/** Meta tags like [ti:xxx] / [ar:xxx] / [offset:±ms] — never rendered. */
const META_RE = /^\[(ti|ar|al|by|re|ve|length|offset):/i;

/**
 * Parse raw LRC text.
 * - timed: at least one line carries [mm:ss] timestamps
 * - plain:  text exists but has no timestamps (embedded unsynced lyrics)
 * - null:   empty / garbage
 */
export function parseLrc(raw: string): LrcResult {
  if (!raw || !raw.trim()) return null;
  const rawLines = raw.replace(/\r/g, '').split('\n');

  let offsetMs = 0;
  const offsetLine = rawLines.find((l) => /^\[offset:/i.test(l));
  const offsetMatch = offsetLine?.match(/\[offset:\s*([+-]?\d+)\s*\]/i);
  if (offsetMatch) offsetMs = Number(offsetMatch[1]) || 0;

  const lines: LrcLine[] = [];
  let sawTimestamp = false;
  const plainParts: string[] = [];

  for (const rawLine of rawLines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (META_RE.test(line)) continue;

    TIME_RE.lastIndex = 0;
    const stamps: number[] = [];
    let m: RegExpExecArray | null;
    let cursor = 0;
    let textStart = -1;
    while ((m = TIME_RE.exec(line)) !== null) {
      const min = Number(m[1]);
      const sec = Number(m[2]);
      const fracRaw = m[3] || '0';
      const frac = Number(fracRaw) / Math.pow(10, fracRaw.length);
      stamps.push(min * 60 + sec + frac);
      cursor = m.index + m[0].length;
      if (textStart < 0) textStart = m.index;
    }
    if (stamps.length > 0) {
      sawTimestamp = true;
      const text = line.slice(cursor).trim();
      for (const t of stamps) {
        lines.push({ time: Math.max(0, t + offsetMs / 1000), text });
      }
    } else {
      plainParts.push(line);
    }
  }

  if (sawTimestamp) {
    lines.sort((a, b) => a.time - b.time);
    return { kind: 'timed', lines };
  }
  const text = plainParts.join('\n').trim();
  return text ? { kind: 'plain', text } : null;
}

/** Convert a timed result into a plain text transcript. */
export function lrcToPlain(result: Extract<LrcResult, { kind: 'timed' }>): string {
  return result.lines.map((l) => l.text).filter((t, i, arr) => t || i === 0 || arr[i - 1]).join('\n');
}
