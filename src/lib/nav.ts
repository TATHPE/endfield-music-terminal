// EXPORTS: ViewId, NAV_ITEMS, DOCK_SEARCH_ID
import { PAGES } from '@/lib/strings';

export type ViewId = 'library' | 'playlists' | 'search' | 'nowplaying' | 'settings';

export interface NavItem {
  id: ViewId;
  label: string;
  code: string;
}

/** 底部导航标签统一取自 src/lib/strings.ts，避免两处维护。 */
export const NAV_ITEMS: NavItem[] = [
  { id: 'library', label: PAGES.LIBRARY, code: '[01]' },
  { id: 'playlists', label: PAGES.PLAYLISTS, code: '[02]' },
  { id: 'search', label: PAGES.SEARCH, code: '[05]' },
  { id: 'nowplaying', label: PAGES.NOW_PLAYING, code: '[03]' },
  { id: 'settings', label: PAGES.SETTINGS, code: '[04]' },
];

/** Center search lives between the two left tabs and the two right tabs. */
export const DOCK_SEARCH_ID: ViewId = 'search';
