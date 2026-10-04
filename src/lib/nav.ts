// EXPORTS: ViewId, NAV_ITEMS
export type ViewId = 'library' | 'playlists' | 'nowplaying' | 'settings';

export interface NavItem {
  id: ViewId;
  label: string;
  code: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'library', label: '曲库', code: '[01]' },
  { id: 'playlists', label: '歌单', code: '[02]' },
  { id: 'nowplaying', label: '正在播放', code: '[03]' },
  { id: 'settings', label: '设置', code: '[04]' },
];
