// EXPORTS: RadioStation, RADIO_API_BASES, RADIO_ERROR_MESSAGE, RadioBrowserError,
//          mapStation, dedupeStations, stationSubtitle, searchStations
/**
 * radio-browser.info 网络电台目录接入层。
 *
 * 产品边界：本程序只“播放”用户在公开目录里点选的电台流，不内置、不托管、不代理
 * 任何音乐资源，也不搜索盗版音源。radio-browser.info 是社区维护的**公共网络电台**
 * 目录（公开数据、无需鉴权），因此这里只做：搜索 → 展示 → 把用户选中的流地址交给
 * 播放器。
 *
 * 设计要点：
 *  - 多个官方镜像按顺序尝试，任一成功即返回，全部失败才抛错；
 *  - 每次请求都带硬超时（AbortSignal.timeout），并手动与调用方 signal 串联
 *    （旧版 Android WebView 没有 AbortSignal.any，不能依赖它）；
 *  - 解析逻辑全部收敛在纯函数 mapStation / dedupeStations / stationSubtitle 里，
 *    便于离线单测（不发真实网络请求）。
 */

/** 列表项：已归一化、可直接渲染的电台。 */
export interface RadioStation {
  id: string;
  name: string;
  url: string;
  codec: string;
  /** kbps；未知为 0 */
  bitrate: number;
  /** ISO 国家码（如 CN），未知为空串 */
  country: string;
  /** 标签数组（已去空、去重） */
  tags: string[];
  homepage: string;
  favicon: string;
  /** m3u8/HLS —— 安卓 WebView 的 <audio> 播不了，UI 必须禁用添加 */
  unsupported: boolean;
}

/** 官方镜像，按顺序尝试。 */
export const RADIO_API_BASES = [
  'https://de1.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
  'https://at1.api.radio-browser.info',
];

/** 所有镜像都不可达时给用户看的文案（UI 直接展示这句）。 */
export const RADIO_ERROR_MESSAGE = '电台服务暂时不可达，请稍后再试或改用在线地址';

/** 单次请求的硬超时。 */
export const RADIO_REQUEST_TIMEOUT_MS = 8000;

/** 默认返回条数。 */
export const RADIO_SEARCH_LIMIT = 20;

/**
 * 客户端标识。radio-browser 要求客户端标明身份（否则可能被限流）。
 * 注意：浏览器/WebView 出于规范会忽略脚本设置的 User-Agent，这里带上是为了
 * 非浏览器运行时也能正确标识；服务端已返回 `Access-Control-Allow-Origin: *`，
 * 因此在 WebView（origin 为 http(s)://localhost）里同样可以直接请求。
 */
const USER_AGENT = 'EndfieldMusicTerminal/1.4 (+https://github.com/endfield-music-terminal)';

/** 搜索失败（含超时、全部镜像不可达）。 */
export class RadioBrowserError extends Error {
  constructor(message: string = RADIO_ERROR_MESSAGE) {
    super(message);
    this.name = 'RadioBrowserError';
  }
}

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function httpUrl(value: unknown): string {
  const raw = asString(value);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    if (!parsed.hostname) return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

/** 标签既可能是数组，也可能是逗号分隔字符串。 */
function parseTags(value: unknown): string[] {
  const parts = Array.isArray(value)
    ? value.map(asString)
    : asString(value).split(',');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const tag = part.trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

export function isUnsupportedCodec(codec: string, url: string): boolean {
  const c = (codec || '').toUpperCase();
  if (c.includes('HLS')) return true;
  return /\.m3u8(?:[?#]|$)/i.test(url || '');
}

/**
 * 把 radio-browser 的原始条目归一化成 RadioStation。
 * 纯函数：字段缺失、名字为空、非 http(s) 地址一律返回 null。
 */
export function mapStation(raw: unknown): RadioStation | null {
  const r = asRecord(raw);

  const name = asString(r.name);
  if (!name) return null;

  // url_resolved 是 radio-browser 解析后的直链，取不到再退回 url。
  let url = httpUrl(r.url_resolved);
  if (!url) url = httpUrl(r.url);
  if (!url) return null;

  const codec = asString(r.codec);
  const id = asString(r.stationuuid) || asString(r.id) || url;

  return {
    id,
    name,
    url,
    codec,
    bitrate: Math.max(0, asNumber(r.bitrate)),
    country: asString(r.countrycode).toUpperCase(),
    tags: parseTags(r.tags),
    homepage: httpUrl(r.homepage),
    favicon: httpUrl(r.favicon),
    unsupported: isUnsupportedCodec(codec, url),
  };
}

/** 按播放地址去重，保留先出现的一条。 */
export function dedupeStations(list: RadioStation[]): RadioStation[] {
  const seen = new Set<string>();
  const out: RadioStation[] = [];
  for (const station of list || []) {
    if (!station || !station.url) continue;
    if (seen.has(station.url)) continue;
    seen.add(station.url);
    out.push(station);
  }
  return out;
}

/** 两位 ISO 国家码 → 中文国家名；Intl 不支持或查不到时原样返回代码。 */
function countryLabel(code: string): string {
  if (!code) return '';
  if (code.length !== 2) return code;
  try {
    const region = typeof Intl !== 'undefined' ? (Intl as any).DisplayNames : undefined;
    if (region) {
      const display = new region(['zh-CN'], { type: 'region' });
      const label = display.of(code);
      if (label && label !== code) return label;
    }
  } catch {
    /* 旧运行时没有 Intl.DisplayNames —— 退回国家码 */
  }
  return code;
}

/** 副标题，如 `中国 · MP3 · 128kbps`；缺哪段就跳过哪段，全缺则空串。 */
export function stationSubtitle(s: RadioStation): string {
  if (!s) return '';
  const parts: string[] = [];
  const country = countryLabel(s.country);
  if (country) parts.push(country);
  if (s.codec) parts.push(s.codec.toUpperCase());
  if (s.bitrate > 0) parts.push(`${s.bitrate}kbps`);
  return parts.join(' · ');
}

/** 手动把超时信号与调用方信号串成一个 controller（不依赖 AbortSignal.any）。 */
function linkSignals(
  timeoutMs: number,
  external?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', onExternalAbort);
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      if (external) external.removeEventListener('abort', onExternalAbort);
    },
  };
}

/** 组装搜索 URL（纯逻辑，便于断言）。 */
function buildSearchUrl(base: string, query: string, limit: number): string {
  const params = new URLSearchParams({
    name: query,
    limit: String(limit),
    hidebroken: 'true',
    order: 'clickcount',
    reverse: 'true',
  });
  return `${base.replace(/\/+$/, '')}/json/stations/search?${params.toString()}`;
}

async function fetchStationsFrom(
  base: string,
  query: string,
  limit: number,
  external?: AbortSignal,
): Promise<RadioStation[]> {
  const { signal, cleanup } = linkSignals(RADIO_REQUEST_TIMEOUT_MS, external);
  try {
    const response = await globalThis.fetch(buildSearchUrl(base, query, limit), {
      method: 'GET',
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal,
      // 显式声明：这些是公开目录数据，不需要携带任何凭据。
      credentials: 'omit',
      mode: 'cors',
    });
    if (!response || !response.ok) throw new Error(`HTTP ${response.status}`);
    const data: unknown = await response.json();
    if (!Array.isArray(data)) throw new Error('unexpected payload');
    return dedupeStations(
      data.map(mapStation).filter((s): s is RadioStation => s !== null),
    );
  } finally {
    cleanup();
  }
}

/**
 * 在公开电台目录里按关键词搜索。
 * 镜像依次尝试；调用方取消会立刻中断；全部镜像失败时抛 RadioBrowserError。
 */
export async function searchStations(
  query: string,
  opts: { limit?: number; signal?: AbortSignal } = {},
): Promise<RadioStation[]> {
  const q = (query || '').trim();
  if (!q) return [];

  const limit = Math.max(1, Math.min(100, Math.trunc(opts.limit ?? RADIO_SEARCH_LIMIT)));

  for (const base of RADIO_API_BASES) {
    if (opts.signal?.aborted) throw new RadioBrowserError('搜索已取消');
    try {
      return await fetchStationsFrom(base, q, limit, opts.signal);
    } catch (error) {
      // 用户主动取消：不再换镜像，直接把取消状态交回调用方。
      if (opts.signal?.aborted) throw error;
      // 否则换下一个镜像重试。
    }
  }
  throw new RadioBrowserError(RADIO_ERROR_MESSAGE);
}
