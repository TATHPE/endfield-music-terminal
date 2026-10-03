// EXPORTS: ViewId, NAV_ITEMS
export type ViewId = 'library' | 'nowplaying';

export interface NavItem {
  id: ViewId;
  label: string;
  code: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'library', label: '曲库', code: '[01]' },
  { id: 'nowplaying', label: '正在播放', code: '[02]' },
];
