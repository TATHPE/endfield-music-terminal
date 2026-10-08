// EXPORTS: ViewId, NAV_ITEMS, DOCK_ITEMS
export type ViewId = 'library' | 'playlists' | 'search' | 'nowplaying' | 'settings';

export interface NavItem {
  id: ViewId;
  label: string;
  code: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'library', label: '介质库', code: '[01]' },
  { id: 'playlists', label: '播放序列', code: '[02]' },
  { id: 'search', label: '全域检索', code: '[05]' },
  { id: 'nowplaying', label: '音频输出', code: '[03]' },
  { id: 'settings', label: '系统配置', code: '[04]' },
];

/** Center search lives between the two left tabs and the two right tabs. */
export const DOCK_SEARCH_ID: ViewId = 'search';
