// EXPORTS: SettingsView
import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DEFAULT_CUSTOM,
  PRESET_COLORS,
  THEMES,
  applyTheme,
  getBgMode,
  getCustomTheme,
  getTheme,
  setBgMode,
  setCustomTheme,
  setTheme,
  type BgMode,
  type CustomColors,
  type ThemeId,
} from '@/lib/theme';
import HazardStrip from '@/components/player/HazardStrip';

function ThemeCard({
  id,
  name,
  code,
  desc,
  colors,
  active,
  onSelect,
}: {
  id: ThemeId;
  name: string;
  code: string;
  desc: string;
  colors: [string, string, string];
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        'group relative flex w-full flex-col gap-2.5 border p-3 text-left transition-all duration-200',
        active
          ? 'border-accent bg-accent/10 shadow-[0_0_18px_-4px] shadow-accent/40'
          : 'border-border bg-card hover:border-accent/40 hover:bg-card/80',
      )}
      style={{ clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%)' }}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] tracking-[0.3em] text-muted-foreground">{code}</span>
        {active && (
          <span className="blink-dot font-mono text-[9px] tracking-[0.24em] text-accent">● ACTIVE</span>
        )}
      </div>
      {/* Three equal swatches, evenly distributed */}
      <div className="grid grid-cols-3 gap-2" aria-hidden>
        {colors.map((c) => (
          <span
            key={c}
            className="aspect-square w-full border border-white/10 transition-transform group-hover:scale-105"
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <div>
        <div className="text-sm font-bold tracking-widest text-foreground">{name}</div>
        <div className="mt-0.5 font-mono text-[10px] tracking-wider text-muted-foreground">{desc}</div>
      </div>
    </button>
  );
}

type Channel = keyof CustomColors;

const CHANNELS: ReadonlyArray<{ key: Channel; label: string }> = [
  { key: 'primary', label: '主色 PRIMARY' },
  { key: 'secondary', label: '辅助色 SECONDARY' },
  { key: 'tertiary', label: '点缀色 TERTIARY' },
];

// ---- small color math (hsl <-> hex) for the self-drawn picker ----

function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100;
  const ln = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to255 = (v: number) => Math.round(255 * v);
  return `#${[f(0), f(8), f(4)].map((v) => to255(v).toString(16).padStart(2, '0')).join('')}`;
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const raw = m ? m[1] : 'FF01A4';
  const r = parseInt(raw.slice(0, 2), 16) / 255;
  const g = parseInt(raw.slice(2, 4), 16) / 255;
  const b = parseInt(raw.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/** Saturation/Lightness 2D pad — click to pick. */
function SvPad({
  hue,
  sat,
  light,
  onPick,
}: {
  hue: number;
  sat: number;
  light: number;
  onPick: (sat: number, light: number) => void;
}) {
  return (
    <div
      role="slider"
      aria-label="饱和度 / 亮度"
      aria-valuetext={`S${sat} L${light}`}
      className="relative h-36 w-full cursor-crosshair touch-none select-none rounded border border-white/15"
      style={{
        background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hue} 100% 50%))`,
      }}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
        onPick(Math.round(x * 100), Math.round((1 - y) * 100));
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
        style={{ left: `${sat}%`, top: `${100 - light}%` }}
      />
    </div>
  );
}

/** Hue bar — click to pick hue. */
function HueBar({ hue, onChange }: { hue: number; onChange: (h: number) => void }) {
  return (
    <div
      role="slider"
      aria-label="色相"
      aria-valuetext={`${hue}°`}
      className="relative h-5 w-full cursor-pointer touch-none select-none rounded-full border border-white/15"
      style={{
        background:
          'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)',
      }}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        onChange(Math.round(x * 360));
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 h-4 w-[6px] -translate-x-1/2 -translate-y-1/2 rounded-sm border border-black/60 bg-white shadow"
        style={{ left: `${(hue / 360) * 100}%` }}
      />
    </div>
  );
}

/** Custom theme editor: channels + self-drawn HSV picker + hex input + presets. */
function CustomEditor() {
  const [custom, setCustom] = useState<CustomColors>(() => getCustomTheme());
  const [channel, setChannel] = useState<Channel>('primary');

  const apply = (next: CustomColors) => {
    setCustom(next);
    setCustomTheme(next);
  };

  const activeHsl = hexToHsl(custom[channel]);

  return (
    <div className="flex flex-col gap-3 border border-accent/50 bg-accent/5 p-3" style={{ clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%)' }}>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-[0.26em] text-accent">CUSTOMIZE // 自定义配色</span>
        <button
          type="button"
          onClick={() => apply({ ...DEFAULT_CUSTOM })}
          className="flex items-center gap-1 font-mono text-[9px] tracking-widest text-muted-foreground hover:text-accent"
        >
          <RotateCcw className="h-3 w-3" /> 恢复默认
        </button>
      </div>

      {/* channel rows */}
      {CHANNELS.map(({ key, label }) => {
        const active = channel === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => setChannel(key)}
            aria-pressed={active}
            className={cn(
              'flex items-center gap-2.5 border px-2.5 py-2 text-left transition-colors',
              active ? 'border-accent/60 bg-accent/10' : 'border-border bg-card/70',
            )}
          >
            <span
              aria-hidden
              className="h-7 w-7 shrink-0 rounded border border-white/15"
              style={{ backgroundColor: custom[key] }}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold tracking-wider text-foreground">{label}</span>
              <span className="block font-mono text-[9px] tracking-widest text-muted-foreground">
                {custom[key].toUpperCase()}
              </span>
            </span>
            {active && <span className="font-mono text-[8px] tracking-widest text-accent">PICK ▼</span>}
          </button>
        );
      })}

      {/* preset palette first: high in the page, always clear of the dock */}
      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-[9px] tracking-[0.24em] text-muted-foreground">
          预设色板 → 应用到 {CHANNELS.find((c) => c.key === channel)?.label ?? '主色'}
        </span>
        <div className="grid grid-cols-6 gap-1.5">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`预设色 ${c}`}
              onClick={() => apply({ ...custom, [channel]: c })}
              className={cn(
                'aspect-square border transition-transform hover:scale-110',
                custom[channel].toLowerCase() === c.toLowerCase()
                  ? 'border-foreground ring-1 ring-foreground'
                  : 'border-white/15',
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      {/* self-drawn picker for the active channel */}
      <div className="flex flex-col gap-2 rounded border border-accent/30 bg-background/60 p-2.5">
        <SvPad
          hue={activeHsl.h}
          sat={activeHsl.s}
          light={activeHsl.l}
          onPick={(s, l) => apply({ ...custom, [channel]: hslToHex(activeHsl.h, s, l) })}
        />
        <HueBar hue={activeHsl.h} onChange={(h) => apply({ ...custom, [channel]: hslToHex(h, activeHsl.s, activeHsl.l) })} />
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="h-6 w-9 shrink-0 rounded border border-white/15"
            style={{ backgroundColor: custom[channel] }}
          />
          <input
            type="text"
            value={custom[channel].toUpperCase()}
            onChange={(e) => {
              const v = e.target.value.trim();
              if (/^#?[0-9a-fA-F]{6}$/.test(v)) {
                apply({ ...custom, [channel]: v.startsWith('#') ? v : `#${v}` });
              }
            }}
            spellCheck={false}
            className="w-24 border border-border bg-card px-2 py-1 font-mono text-[11px] tracking-widest text-foreground outline-none focus:border-accent/60"
          />
          <span className="font-mono text-[8px] tracking-widest text-muted-foreground">HEX 直输</span>
        </div>
      </div>
    </div>
  );
}

/** Background mode picker: solid black / solid white shell. */
function BgModePicker() {
  const [mode, setLocalMode] = useState<BgMode>(() => getBgMode());

  const pick = (m: BgMode) => {
    setBgMode(m);
    setLocalMode(m);
  };

  const options: Array<{ id: BgMode; label: string; swatch: string }> = [
    { id: 'dark', label: '黑色 BLACK', swatch: '#0A0A0C' },
    { id: 'light', label: '白色 WHITE', swatch: '#F4F4F0' },
  ];

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.26em] text-muted-foreground">
        <span className="text-accent">▸</span> 背景 BACKGROUND
      </div>
      <div className="grid grid-cols-2 gap-3">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => pick(o.id)}
            aria-pressed={mode === o.id}
            className={cn(
              'flex items-center gap-2.5 border p-2.5 text-left transition-all duration-200',
              mode === o.id
                ? 'border-accent bg-accent/10 shadow-[0_0_14px_-4px] shadow-accent/40'
                : 'border-border bg-card hover:border-accent/40',
            )}
            style={{ clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%)' }}
          >
            <span
              aria-hidden
              className="h-7 w-7 shrink-0 border border-white/15"
              style={{ backgroundColor: o.swatch }}
            />
            <span className="font-mono text-[11px] tracking-wider text-foreground">{o.label}</span>
          </button>
        ))}
      </div>
      <p className="font-mono text-[9px] leading-relaxed tracking-wider text-muted-foreground/80">
        纯色外壳：深色（黑色基底）或浅色（白色基底）整体切换，玻璃 Dock 与播放条自动跟随明暗。
      </p>
    </section>
  );
}

/** Settings — theme selection + custom theme editor. */
export default function SettingsView() {
  const [theme, setLocalTheme] = useState<ThemeId>(() => getTheme());
  const [customColors] = useState<CustomColors>(() => getCustomTheme());

  const pick = (id: ThemeId) => {
    setTheme(id);
    applyTheme(id);
    setLocalTheme(id);
  };

  const themeColors: Record<ThemeId, [string, string, string]> = {
    default: ['#F2C200', '#0A0A0C', '#F1F0EA'],
    prism: ['#FF01A4', '#00FFC9', '#FEFE1F'],
    custom: [customColors.primary, customColors.secondary, customColors.tertiary],
  };

  return (
    <div className="flex h-full flex-col gap-4 px-4 pb-6 pt-4">
      <header className="flex items-center justify-between">
        <h2 className="font-mono text-xs tracking-[0.34em] text-foreground">
          SETTINGS <span className="text-muted-foreground">// 参数配置</span>
        </h2>
        <span className="font-mono text-[9px] tracking-widest text-muted-foreground">CFG-04</span>
      </header>
      <HazardStrip className="h-[3px] opacity-60" />

      <BgModePicker />

      <section className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.26em] text-muted-foreground">
          <span className="text-accent">▸</span> 主题 THEME
        </div>
        <div className="grid grid-cols-3 gap-3">
          {THEMES.map((t) => (
            <ThemeCard
              key={t.id}
              id={t.id}
              name={t.name}
              code={t.code}
              desc={t.desc}
              colors={themeColors[t.id]}
              active={theme === t.id}
              onSelect={() => pick(t.id)}
            />
          ))}
        </div>
        <p className="mt-0.5 font-mono text-[9px] leading-relaxed tracking-wider text-muted-foreground/80">
          T-01 标准终端：柠檬黄警戒配色，默认出厂。T-02 棱镜频谱：亮粉 / 青绿 / 明黄三色覆盖全部界面。T-03 自定义：自由调配三色，实时生效并保存。
        </p>

        {theme === 'custom' && <CustomEditor />}
      </section>
    </div>
  );
}
