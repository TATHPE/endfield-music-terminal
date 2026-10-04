// EXPORTS: SettingsView
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { THEMES, applyTheme, getTheme, setTheme, type ThemeId } from '@/lib/theme';
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
      <div className="flex gap-1.5" aria-hidden>
        {colors.map((c) => (
          <span
            key={c}
            className="h-6 w-10 border border-white/10 transition-transform group-hover:scale-105"
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

/** Settings — theme selection (applies instantly, persisted in localStorage). */
export default function SettingsView() {
  const [theme, setLocalTheme] = useState<ThemeId>(() => getTheme());

  const pick = (id: ThemeId) => {
    setTheme(id);
    applyTheme(id);
    setLocalTheme(id);
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

      <section className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.26em] text-muted-foreground">
          <span className="text-accent">▸</span> 主题 THEME
        </div>
        <div className="grid grid-cols-2 gap-3">
          {THEMES.map((t) => (
            <ThemeCard
              key={t.id}
              id={t.id}
              name={t.name}
              code={t.code}
              desc={t.desc}
              colors={t.colors}
              active={theme === t.id}
              onSelect={() => pick(t.id)}
            />
          ))}
        </div>
        <p className="mt-1 font-mono text-[9px] leading-relaxed tracking-wider text-muted-foreground/80">
          T-01 标准终端：柠檬黄警戒配色，默认出厂。T-02 棱镜频谱：亮粉 / 青绿 / 明黄三色覆盖全部界面，
          含启动动画、警戒条纹与歌词高亮。
        </p>
      </section>
    </div>
  );
}
