// EXPORTS: ThemeId, ThemeMeta, CustomColors, THEMES, PRESET_COLORS, getTheme,
//          getCustomTheme, applyTheme, setTheme, applyCustomTheme, setCustomTheme
export type ThemeId = 'default' | 'prism' | 'custom';

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  code: string;
  desc: string;
  /** Three swatch colors shown in the picker. */
  colors: [string, string, string];
}

/** User-defined three-color scheme for the custom theme. */
export interface CustomColors {
  /** Primary / accent — drives buttons, progress, active nav. */
  primary: string;
  /** Secondary / info — drives success, info, secondary accents. */
  secondary: string;
  /** Tertiary / warning — accent pops. */
  tertiary: string;
}

export const THEMES: ThemeMeta[] = [
  {
    id: 'default',
    name: '标准终端',
    code: 'T-01',
    desc: '柠檬黄 / 黑 / 暖白',
    colors: ['#F2C200', '#0A0A0C', '#F1F0EA'],
  },
  {
    id: 'prism',
    name: '棱镜频谱',
    code: 'T-02',
    desc: '亮粉 / 青绿 / 明黄',
    colors: ['#FF01A4', '#00FFC9', '#FEFE1F'],
  },
  {
    id: 'custom',
    name: '自定义',
    code: 'T-03',
    desc: '自由配色',
    colors: ['#FF01A4', '#00FFC9', '#FEFE1F'],
  },
];

/** Quick-pick palette for the custom theme editor. */
export const PRESET_COLORS: string[] = [
  '#FF01A4', '#00FFC9', '#FEFE1F', '#F2C200', '#FF5C00', '#FF2D55',
  '#5E5CE6', '#0A84FF', '#30D158', '#FFD60A', '#BF5AF2', '#64D2FF',
];

export const THEME_KEY = 'endfield-player:theme';
export const CUSTOM_THEME_KEY = 'endfield-player:custom-theme';

export const DEFAULT_CUSTOM: CustomColors = {
  primary: '#FF01A4',
  secondary: '#00FFC9',
  tertiary: '#FEFE1F',
};

export function getTheme(): ThemeId {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'prism' || v === 'custom' ? v : 'default';
  } catch {
    return 'default';
  }
}

export function getCustomTheme(): CustomColors {
  try {
    const raw = localStorage.getItem(CUSTOM_THEME_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<CustomColors>;
      return {
        primary: typeof p.primary === 'string' ? p.primary : DEFAULT_CUSTOM.primary,
        secondary: typeof p.secondary === 'string' ? p.secondary : DEFAULT_CUSTOM.secondary,
        tertiary: typeof p.tertiary === 'string' ? p.tertiary : DEFAULT_CUSTOM.tertiary,
      };
    }
  } catch {
    /* storage unavailable */
  }
  return { ...DEFAULT_CUSTOM };
}

/** CSS custom properties driven by a custom scheme (overrides the prism base). */
const CUSTOM_VARS: ReadonlyArray<readonly [string, string]> = [
  ['--primary', 'primary'],
  ['--primary-foreground', 'fg'],
  ['--accent', 'primary'],
  ['--accent-foreground', 'fg'],
  ['--ring', 'primary'],
  ['--info', 'secondary'],
  ['--info-foreground', 'fg'],
  ['--success', 'secondary'],
  ['--success-foreground', 'fg'],
  ['--warning', 'tertiary'],
  ['--warning-foreground', 'fg'],
  ['--chart-1', 'primary'],
  ['--chart-2', 'secondary'],
  ['--chart-3', 'tertiary'],
  ['--chart-4', 'primary'],
  ['--chart-5', 'secondary'],
  ['--sidebar-primary', 'primary'],
  ['--sidebar-primary-foreground', 'fg'],
  ['--sidebar-ring', 'primary'],
  ['--sidebar-accent-foreground', 'primary'],
];

const FG = '#0A0A0C';

function clearInlineTheme(el: HTMLElement) {
  for (const [name] of CUSTOM_VARS) {
    el.style.removeProperty(name);
  }
}

/** Apply a custom scheme as inline CSS variables (prism structure + custom colors). */
export function applyCustomTheme(c: CustomColors) {
  const el = document.documentElement;
  el.dataset.theme = 'prism';
  clearInlineTheme(el);
  for (const [name, key] of CUSTOM_VARS) {
    const val = key === 'fg' ? FG : c[key as keyof CustomColors];
    el.style.setProperty(name, val);
  }
}

/** Apply the persisted theme before first paint. */
export function applyTheme(id: ThemeId) {
  const el = document.documentElement;
  if (id === 'default') {
    delete el.dataset.theme;
    clearInlineTheme(el);
  } else if (id === 'prism') {
    el.dataset.theme = 'prism';
    clearInlineTheme(el);
  } else {
    applyCustomTheme(getCustomTheme());
  }
}

export function setTheme(id: ThemeId) {
  try {
    localStorage.setItem(THEME_KEY, id);
  } catch {
    /* storage unavailable */
  }
  applyTheme(id);
}

export function setCustomTheme(c: CustomColors) {
  try {
    localStorage.setItem(CUSTOM_THEME_KEY, JSON.stringify(c));
  } catch {
    /* storage unavailable */
  }
  localStorage.setItem(THEME_KEY, 'custom');
  applyCustomTheme(c);
}

// ---- Background mode: solid black / solid white shell ----

export type BgMode = 'dark' | 'light';
export const BG_MODE_KEY = 'endfield-player:bgmode';

export function getBgMode(): BgMode {
  try {
    return localStorage.getItem(BG_MODE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyBgMode(mode: BgMode) {
  const el = document.documentElement;
  if (mode === 'light') el.dataset.bgmode = 'light';
  else delete el.dataset.bgmode;
}

export function setBgMode(mode: BgMode) {
  try {
    localStorage.setItem(BG_MODE_KEY, mode);
  } catch {
    /* storage unavailable */
  }
  applyBgMode(mode);
}
