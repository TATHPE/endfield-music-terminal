import { describe, expect, it } from 'vitest';
import { lrcToPlain, parseLrc } from '@/lib/lyrics';

describe('parseLrc', () => {
  it('returns null for empty or whitespace-only input', () => {
    expect(parseLrc('')).toBeNull();
    expect(parseLrc('   \n  ')).toBeNull();
  });

  it('returns plain text when no timestamps are present', () => {
    const r = parseLrc('第一行\n第二行');
    expect(r).toEqual({ kind: 'plain', text: '第一行\n第二行' });
  });

  it('parses timed lines with [mm:ss] and [mm:ss.xx]', () => {
    const r = parseLrc('[00:01.50]a\n[00:03]b');
    expect(r?.kind).toBe('timed');
    if (r?.kind !== 'timed') throw new Error('expected timed');
    expect(r.lines).toEqual([
      { time: 1.5, text: 'a' },
      { time: 3, text: 'b' },
    ]);
  });

  it('expands several timestamps on one line', () => {
    const r = parseLrc('[00:01][00:02]x');
    if (r?.kind !== 'timed') throw new Error('expected timed');
    expect(r.lines.map((l) => l.time)).toEqual([1, 2]);
  });

  it('drops [ti:]/[ar:]/[offset:] header lines', () => {
    const r = parseLrc('[ti:Title]\n[ar:Artist]\n[offset:0]\n[00:01]only line');
    if (r?.kind !== 'timed') throw new Error('expected timed');
    expect(r.lines).toEqual([{ time: 1, text: 'only line' }]);
  });

  it('drops NetEase-style credit lines that carry timestamps', () => {
    expect(parseLrc('[00:01]作词 : 某人')).toBeNull();
    const r = parseLrc('[00:01]作词 : 某人\n[00:05]真正的一句');
    if (r?.kind !== 'timed') throw new Error('expected timed');
    expect(r.lines).toEqual([{ time: 5, text: '真正的一句' }]);
  });

  it('applies the [offset:] header (ms) and the user shift (s)', () => {
    const shiftedByHeader = parseLrc('[offset:-500]\n[00:01.00]a');
    if (shiftedByHeader?.kind !== 'timed') throw new Error('expected timed');
    expect(shiftedByHeader.lines[0].time).toBeCloseTo(0.5, 5);

    const shiftedByUser = parseLrc('[00:02]a', 1);
    if (shiftedByUser?.kind !== 'timed') throw new Error('expected timed');
    expect(shiftedByUser.lines[0].time).toBeCloseTo(3, 5);
  });

  it('never moves a line before zero', () => {
    const r = parseLrc('[00:00.50]a', -5);
    if (r?.kind !== 'timed') throw new Error('expected timed');
    expect(r.lines[0].time).toBe(0);
  });

  it('sorts the lines by time', () => {
    const r = parseLrc('[00:09]late\n[00:01]early');
    if (r?.kind !== 'timed') throw new Error('expected timed');
    expect(r.lines.map((l) => l.text)).toEqual(['early', 'late']);
  });
});

describe('lrcToPlain', () => {
  it('joins the lyric text', () => {
    const r = parseLrc('[00:01]a\n[00:02]b');
    if (r?.kind !== 'timed') throw new Error('expected timed');
    expect(lrcToPlain(r)).toBe('a\nb');
  });
});
