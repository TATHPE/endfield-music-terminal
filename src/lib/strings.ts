// EXPORTS: PAGES, ACTIONS, STATES, LABELS, TOASTS + 模板文案函数
/**
 * 集中式界面文案表（P2-11）。
 *
 * 收录范围：出现 ≥2 次的字面量，以及应用级标签（页面标题、通用操作、通用状态
 * 与通用提示）。一次性说明性长句仍留在各自组件内部。
 *
 * 约定：值必须与原文逐字一致 —— 全角标点（（）、：、，）、间隔符（— · ）、
 * 空格与 emoji 均不得改动；带变量的文案一律导出为函数。
 */

/** 页面 / 面板标题 —— nav.ts 的 NAV_ITEMS 标签直接引用这里（单一真源）。 */
export const PAGES = {
  LIBRARY: '介质库',
  PLAYLISTS: '播放序列',
  SEARCH: '全域检索',
  NOW_PLAYING: '音频输出',
  SETTINGS: '系统配置',
  QUEUE: '播放队列',
  MEDIA_TAGS: '介质标签',
  ADD_TO_PLAYLIST: '加入播放序列',
  PAGE_ERROR: '页面出错了',
  NOT_FOUND: '页面不存在',
} as const;

/** 通用操作文案。 */
export const ACTIONS = {
  PLAY: '播放',
  PAUSE: '暂停',
  PREV: '上一首',
  NEXT: '下一首',
  FAVORITE: '收藏',
  UNFAVORITE: '取消收藏',
  MUTE: '静音',
  UNMUTE: '取消静音',
  CANCEL: '取消',
  CLOSE: '关闭',
  CLEAR: '清空',
  IMPORT: '导入曲目',
  SCAN_DEVICE: '扫描设备',
  NEW_PLAYLIST: '新建播放序列',
  RETRY: '重试',
  BACK_HOME: '返回首页',
} as const;

/** 状态与空态。 */
export const STATES = {
  UNKNOWN_ARTIST: '未知艺术家',
  UNKNOWN_ALBUM: '未知专辑',
  UNKNOWN_SOURCE: '未知源',
  UNKNOWN_QUEUE: '未知清单',
  EMPTY_LIBRARY: '介质库为空',
  EMPTY_QUEUE: '队列为空 — 请先导入曲目',
  NO_PLAYLISTS: '未创建播放序列',
  NO_TRACK_PLAYING: '没有正在播放的曲目',
  NO_LYRICS: '这首歌没有歌词',
} as const;

/** 控件标签：aria-label / placeholder 等固定名称。 */
export const LABELS = {
  PLAY_PROGRESS: '播放进度',
  VOLUME: '音量',
  OPEN_NOW_PLAYING: '打开音频输出',
  OPEN_QUEUE: '打开播放队列',
  CLOSE_QUEUE: '关闭队列',
  CLEAR_HINT: '清除提示',
  SCAN_SPEED: '扫描线速度',
  WAKE_TERMINAL: '唤醒终端',
  SCROLL_MODE: '滚动模式',
  LOG_MODE: '日志模式',
  PLAYLIST_NAME_PLACEHOLDER: '新建播放序列名称…',
  /** 导入按钮下方的操作提示：安卓文件选择器需长按第一个文件才能多选 */
  IMPORT_HINT: '可长按多选，或直接拖入多个文件；也支持 .m3u / .pls 歌单',
} as const;

/** 提示语 / 系统状态回执。 */
export const TOASTS = {
  EMPTY_QUEUE_SNAPSHOT: '队列为空，无法保存快照',
  NO_CUSTOM_PLAYLISTS: '暂无自定义播放序列 — 输入名称创建一个',
  SCAN_PERMISSION_DENIED: 'SCAN FAILED — 存储权限被拒绝',
  SCAN_DEVICE_FAILED: 'SCAN FAILED — 扫描设备音频异常',
  SCAN_FAILED: 'SCAN FAILED — 扫描异常',
  SCAN_EMPTY: 'SCAN OK — 设备中未发现可导入的音频',
} as const;

/* ------------------------------------------------------------------ *
 * 模板文案（含变量）：调用处原样替换，勿改写标点、空格与间隔符
 * ------------------------------------------------------------------ */

/** 单曲条目的 aria-label（…Label 后缀以免与 player-context 的动作同名）。 */
export const playLabel = (title: string) => `播放 ${title}`;
export const removeLabel = (title: string) => `移除 ${title}`;
export const queueRemoveLabel = (title: string) => `从队列移除 ${title}`;
export const playlistRemoveLabel = (title: string) => `从播放序列移除 ${title}`;
export const favoriteLabel = (title: string) => `收藏 ${title}`;
export const unfavoriteLabel = (title: string) => `取消收藏 ${title}`;
export const tagEditLabel = (title: string) => `编辑 ${title} 的介质标签`;
export const playlistAssignLabel = (title: string) => `将 ${title} 加入播放序列`;
export const playlistAddLabel = (title: string) => `把 ${title} 加入播放序列`;

/** 播放序列条目的 aria-label。 */
export const playlistExpandLabel = (name: string) => `展开播放序列 ${name}`;
export const playlistPlayLabel = (name: string) => `播放播放序列 ${name}`;
export const playlistRenameLabel = (name: string) => `重命名播放序列 ${name}`;
export const playlistDeleteLabel = (name: string) => `删除播放序列 ${name}`;

/** 其他带变量的界面文案。 */
export const playbackMode = (label: string) => `播放模式：${label}`;
export const presetColor = (color: string) => `预设色 ${color}`;
export const untaggedMedia = (tag: string) => `无「${tag}」标签的介质`;

/** 提示语 / 扫描回执。 */
export const playFailed = (name: string) => `播放失败（${name}）`;
export const playFailedFor = (name: string, title: string) => `播放失败（${name}）：${title}`;
/** code 可能是 MediaError 的数字码，也可能是 'unknown' 兜底值。 */
export const audioLoadFailed = (code: string | number, source: string) =>
  `音频加载失败（MEDIA_ERR_${code}）：${source}`;
export const queueSnapshotSaved = (name: string) => `QUEUE SNAPSHOT 已保存：${name}`;
export const scanFailed = (reason: string) => `SCAN FAILED — ${reason}`;
export const scanAdded = (added: number, skipped: number) =>
  `SCAN OK — 新增 ${added} 首 · 跳过 ${skipped} 首 · 本地歌词已读取`;
export const scanAllPresent = (skipped: number) => `SCAN OK — 设备歌曲已全部在介质库（${skipped} 首）`;
