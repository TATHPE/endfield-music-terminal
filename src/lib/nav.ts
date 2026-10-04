// EXPORTS: ViewId, NAV_ITEMS, DOCK_ITEMS
export type ViewId = 'library' | 'playlists' | 'search' | 'nowplaying' | 'settings';

export interface NavItem {
  id: ViewId;
  label: string;
  code: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'library', label: '曲库', code: '[01]' },
  { id: 'playlists', label: '歌单', code: '[02]' },
  { id: 'search', label: '搜索', code: '[05]' },
  { id: 'nowplaying', label: '正在播放', code: '[03]' },
  { id: 'settings', label: '设置', code: '[04]' },
];

/** Center search lives between the two left tabs and the two right tabs. */
export const DOCK_SEARCH_ID: ViewId = 'search';
