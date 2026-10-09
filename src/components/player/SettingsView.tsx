// EXPORTS: SettingsView
import { useState } from 'react';
import { BellOff, BellRing, RotateCcw, ScanLine } from 'lucide-react';
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
import {
  getTerminalConfig,
  setTerminalConfig,
  type LogLevel,
  type TerminalConfig,
} from '@/lib/terminal-config';
import HazardStrip from '@/components/player/HazardStrip';

const LOG_LEVELS: LogLevel[] = ['trace', 'info', 'warn', 'error'];

function ThemeCard({
  name,
  code,
  desc,
  colors,
  active,
  onSelect,
}: {
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
      title={desc}
      className={cn(
        'group relative flex min-w-0 flex-col gap-1 border p-1.5 text-left transition-all duration-200',
        active
          ? 'border-accent bg-accent/10 shadow-[0_0_14px_-4px] shadow-accent/40'
          : 'border-border bg-card hover:border-accent/40 hover:bg-card/80',
      )}
      style={{ clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%)' }}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="truncate font-mono text-[8px] tracking-[0.2em] text-muted-foreground">{code}</span>
        {active && (
          <span className="blink-dot shrink-0 font-mono text-[8px] tracking-[0.18em] text-accent">●</span>
        )}
      </div>
      {/* Three equal swatches, evenly distributed */}
      <div className="grid grid-cols-3 gap-1" aria-hidden>
        {colors.map((c) => (
          <span
            key={c}
            className="h-5 w-full border border-white/10 transition-transform group-hover:scale-105"
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <div className="truncate text-[11px] font-bold tracking-wide text-foreground">{name}</div>
    </button>
  );
}

type Channel = keyof CustomColors;

const CHANNELS: ReadonlyArray<{ key: Channel; label: string }> = [
  { key: 'primary', label: '主色 PRIMARY' },
  { key: 'secondary', label: '辅助色 SECONDARY' },
  { key: 'tertiary', label: '点缀色 TERTIARY' },
];

/** Custom theme editor: always visible under the theme cards — channel row,
 *  title + 12 preset swatches (the page scrolls instead of squeezing it). */
function CustomEditor({ onUse }: { onUse?: () => void }) {
  const [custom, setCustom] = useState<CustomColors>(() => getCustomTheme());
  const [channel, setChannel] = useState<Channel>('primary');

  const apply = (next: CustomColors) => {
    setCustom(next);
    setCustomTheme(next);
    // Editing a swatch implies the custom theme: keep the T-03 card in sync.
    onUse?.();
  };

  return (
    <div
      className="flex flex-col gap-1.5 border border-accent/50 bg-accent/5 p-2"
      style={{ clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%)' }}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] tracking-[0.24em] text-accent">CUSTOMIZE // 自定义配色</span>
        <button
          type="button"
          onClick={() => apply({ ...DEFAULT_CUSTOM })}
          className="flex items-center gap-1 font-mono text-[8px] tracking-widest text-muted-foreground hover:text-accent"
        >
          <RotateCcw className="h-3 w-3" /> 恢复默认
        </button>
      </div>

      {/* channels in one uniform row */}
      <div className="grid grid-cols-3 gap-1.5">
        {CHANNELS.map(({ key, label }) => {
          const active = channel === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setChannel(key)}
              aria-pressed={active}
              title={label}
              className={cn(
                'flex min-w-0 items-center justify-center gap-1.5 border px-1 py-1 transition-colors',
                active ? 'border-accent/60 bg-accent/10' : 'border-border bg-card/70',
              )}
            >
              <span
                aria-hidden
                className="h-3.5 w-3.5 shrink-0 rounded border border-white/15"
                style={{ backgroundColor: custom[key] }}
              />
              <span className="truncate font-mono text-[8px] tracking-wider text-foreground">{label}</span>
            </button>
          );
        })}
      </div>

      {/* preset palette: title + the 12 quick-pick swatches only */}
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[9px] tracking-[0.2em] text-muted-foreground">
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
    </div>
  );
}

/** Background mode picker: solid black / solid white shell, one compact row. */
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
    <div className="grid grid-cols-2 gap-2">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => pick(o.id)}
          aria-pressed={mode === o.id}
          className={cn(
            'flex items-center justify-center gap-2 border px-2 py-1.5 text-left transition-all duration-200',
            mode === o.id
              ? 'border-accent bg-accent/10 shadow-[0_0_12px_-4px] shadow-accent/40'
              : 'border-border bg-card hover:border-accent/40',
          )}
          style={{ clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%)' }}
        >
          <span aria-hidden className="h-4 w-4 shrink-0 border border-white/15" style={{ backgroundColor: o.swatch }} />
          <span className="font-mono text-[10px] tracking-wide text-foreground">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Terminal behavior: scanlines, beep, idle dim, log verbosity. */
function TerminalBehavior() {
  const [cfg, setCfg] = useState<TerminalConfig>(() => getTerminalConfig());

  const patch = (p: Partial<TerminalConfig>) => {
    const next = { ...cfg, ...p };
    setCfg(next);
    setTerminalConfig(next);
  };

  const idleOptions = [
    { value: 0, label: '常亮' },
    { value: 1, label: '1 分钟' },
    { value: 5, label: '5 分钟' },
  ];

  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 font-mono text-[9px] tracking-[0.24em] text-muted-foreground">
        <span className="text-accent">▸</span> 终端行为 TERMINAL
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => patch({ scanlinesOn: !cfg.scanlinesOn })}
          aria-pressed={cfg.scanlinesOn}
          className={cn(
            'clip-corner-sm flex items-center gap-2 border px-2 py-1.5 font-mono text-[9px] tracking-widest transition-colors',
            cfg.scanlinesOn ? 'border-primary/60 bg-primary/10 text-primary' : 'border-border bg-card/70 text-muted-foreground',
          )}
        >
          <ScanLine className="h-3.5 w-3.5" /> 扫描线 {cfg.scanlinesOn ? 'ON' : 'OFF'}
        </button>
        <button
          type="button"
          onClick={() => patch({ beepOn: !cfg.beepOn })}
          aria-pressed={cfg.beepOn}
          className={cn(
            'clip-corner-sm flex items-center gap-2 border px-2 py-1.5 font-mono text-[9px] tracking-widest transition-colors',
            cfg.beepOn ? 'border-primary/60 bg-primary/10 text-primary' : 'border-border bg-card/70 text-muted-foreground',
          )}
        >
          {cfg.beepOn ? <BellRing className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
          蜂鸣 {cfg.beepOn ? 'ON' : 'OFF'}
        </button>
      </div>
      <div className="grid grid-cols-[1fr_1fr] items-center gap-2">
        <div className="flex items-center gap-1.5 border border-border/70 bg-card/60 px-2 py-1">
          <span className="shrink-0 font-mono text-[8px] tracking-widest text-muted-foreground">SCAN SPD</span>
          <input
            type="range"
            min={4}
            max={24}
            step={1}
            value={cfg.scanSpeed}
            onChange={(e) => patch({ scanSpeed: Number(e.target.value) })}
            aria-label="扫描线速度"
            className="h-1 min-w-0 flex-1 accent-[var(--accent)]"
          />
          <span className="w-6 shrink-0 text-right font-mono text-[8px] tabular-nums text-muted-foreground">
            {cfg.scanSpeed}s
          </span>
        </div>
        <div className="flex items-center gap-1.5 border border-border/70 bg-card/60 px-2 py-1">
          <span className="shrink-0 font-mono text-[8px] tracking-widest text-muted-foreground">LOG</span>
          <button
            type="button"
            onClick={() => {
              const i = LOG_LEVELS.indexOf(cfg.logLevel);
              patch({ logLevel: LOG_LEVELS[(i + 1) % LOG_LEVELS.length] });
            }}
            className="flex-1 text-center font-mono text-[9px] tracking-widest text-foreground hover:text-primary"
          >
            {cfg.logLevel.toUpperCase()}
          </button>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 font-mono text-[8px] tracking-widest text-muted-foreground">IDLE</span>
        {idleOptions.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => patch({ idleMinutes: o.value })}
            aria-pressed={cfg.idleMinutes === o.value}
            className={cn(
              'clip-tag flex-1 px-1 py-0.5 font-mono text-[8px] tracking-widest transition-colors',
              cfg.idleMinutes === o.value
                ? 'bg-primary text-primary-foreground'
                : 'border border-border/70 text-muted-foreground',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </section>
  );
}

/** Settings — background shell, terminal behavior, theme + custom editor. */
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
    night: ['#7FB8B0', '#07080A', '#C9CDD0'],
    custom: [customColors.primary, customColors.secondary, customColors.tertiary],
  };

  return (
    /* Scrollable layout: the shell already reserves bottom padding for the
       floating MiniPlayer + dock, so the whole page scrolls and any number of
       settings rows can be added without squeezing the controls below. */
    <div className="flex flex-col gap-2 px-4 pb-3 pt-2">
      <header className="flex items-center justify-between">
        <h2 className="font-mono text-[11px] tracking-[0.3em] text-foreground">
          SETTINGS <span className="text-muted-foreground">// 系统配置</span>
        </h2>
        <span className="font-mono text-[9px] tracking-widest text-muted-foreground">CFG-04</span>
      </header>
      <HazardStrip className="h-[3px] opacity-60" />

      <BgModePicker />

      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2 font-mono text-[9px] tracking-[0.24em] text-muted-foreground">
          <span className="text-accent">▸</span> 主题 THEME
        </div>
        <div className="grid grid-cols-2 gap-2">
          {THEMES.map((t) => (
            <ThemeCard
              key={t.id}
              name={t.name}
              code={t.code}
              desc={t.desc}
              colors={themeColors[t.id]}
              active={theme === t.id}
              onSelect={() => pick(t.id)}
            />
          ))}
        </div>
        <CustomEditor onUse={() => pick('custom')} />
      </section>

      <TerminalBehavior />
    </div>
  );
}
