// EXPORTS: ThemeId, ThemeMeta, THEMES, getTheme, applyTheme, setTheme
export type ThemeId = 'default' | 'prism';

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  code: string;
  desc: string;
  /** Three swatch colors shown in the picker. */
  colors: [string, string, string];
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
];

export const THEME_KEY = 'endfield-player:theme';

export function getTheme(): ThemeId {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'prism' ? 'prism' : 'default';
  } catch {
    return 'default';
  }
}

/** Apply the theme to <html data-theme>. 'default' leaves the attribute unset so :root wins. */
export function applyTheme(id: ThemeId) {
  const el = document.documentElement;
  if (id === 'prism') {
    el.dataset.theme = 'prism';
  } else {
    delete el.dataset.theme;
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
