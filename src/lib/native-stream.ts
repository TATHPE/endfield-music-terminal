// EXPORTS: isNativeStreamAvailable, openNativeStream, closeNativeStream,
//          decodeBase64, normalizeContentType, StreamFetcher
//
// 原生取流通道的 JS 封装（对应 android StreamFetcherPlugin）。
//
// 为什么需要它：页面 origin 是 https://localhost，浏览器 fetch 必然带 Origin /
// Sec-Fetch-*，SomaFM 等电台的热链保护据此回 403；原生侧用 HttpURLConnection
// 自己发请求（只带 UA），字节经 chunk 事件推回来，仍然交给 MSE 播放器。
//
// 原生侧还有一层背压：未确认字节超过阈值就暂停读取，所以每消费一批都必须
// ack({ id, bytes })；回执由 nativeStreamSource()（stream-source.ts）负责。

import { Capacitor, registerPlugin } from '@capacitor/core';

/** 插件接口：与 StreamFetcherPlugin.java 的 @PluginMethod 一一对应。 */
export interface StreamFetcherPlugin {
  /** 开始取流：立即 resolve，之后靠 chunk / type / failed / ended 事件推送。 */
  start(options: { url: string; id: string }): Promise<void>;
  /** 消费回执：未确认字节降到阈值以下，原生才继续读。 */
  ack(options: { id: string; bytes: number }): Promise<void>;
  /** 关闭会话（幂等）。 */
  stop(options: { id: string }): Promise<void>;
  addListener(
    eventName: 'chunk',
    listener: (event: NativeStreamEvent) => void,
  ): Promise<NativeListenerHandle>;
  addListener(
    eventName: 'type',
    listener: (event: NativeStreamEvent) => void,
  ): Promise<NativeListenerHandle>;
  addListener(
    eventName: 'failed',
    listener: (event: NativeStreamEvent) => void,
  ): Promise<NativeListenerHandle>;
  addListener(
    eventName: 'ended',
    listener: (event: NativeStreamEvent) => void,
  ): Promise<NativeListenerHandle>;
}

export interface NativeListenerHandle {
  remove: () => Promise<void>;
}

/** 名字必须和 @CapacitorPlugin(name = "StreamFetcher") 完全一致。 */
export const StreamFetcher = registerPlugin<StreamFetcherPlugin>('StreamFetcher');

/** 原生事件负载：只有 id 必有，其余按事件类型出现。 */
export interface NativeStreamEvent {
  id: string;
  /** chunk：base64 音频字节 */
  data?: string;
  /** chunk：明文字节数（缺省时按 base64 长度换算） */
  bytes?: number;
  /** type：服务端 Content-Type */
  type?: string;
  /** failed：中文失败原因 */
  message?: string;
}

export interface NativeStreamHandlers {
  onChunk: (event: NativeStreamEvent) => void;
  onType?: (event: NativeStreamEvent) => void;
  onFailed?: (event: NativeStreamEvent) => void;
  onEnded?: (event: NativeStreamEvent) => void;
}

/**
 * 插件是否真实可用（原生平台 + 桥里注册了插件头）。
 * 以探针参数独立出来是为了可测：单测注入探针即可，不必伪造 Capacitor 全局对象。
 */
export type NativeStreamProbe = () => boolean;

const realProbe: NativeStreamProbe = () => {
  try {
    if (typeof Capacitor === 'undefined') return false;
    if (!Capacitor.isNativePlatform()) return false;
    // web 构建里没有插件头，isPluginAvailable 为 false —— 直接走 fetch 通道。
    return Capacitor.isPluginAvailable('StreamFetcher');
  } catch {
    return false;
  }
};

export function isNativeStreamAvailable(probe: NativeStreamProbe = realProbe): boolean {
  return probe();
}

/**
 * base64 → 字节。优先用 atob（WebView 一定有；Node 18+ 也有，便于单测），
 * 两者都缺时用纯 JS 手工解码兜底。
 */
export function decodeBase64(base64: string): Uint8Array {
  const clean = String(base64 || '').trim();
  if (!clean) return new Uint8Array(0);

  const atobFn = typeof atob === 'function' ? atob : null;
  if (atobFn) {
    try {
      const bin = atobFn(clean);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      return bytes;
    } catch {
      // 非法 base64：落到下面的手工解码（多半得到空数组）。
    }
  }

  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Int16Array(256).fill(-1);
  for (let i = 0; i < ALPHABET.length; i += 1) lookup[ALPHABET.charCodeAt(i)] = i;
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i += 1) {
    const code = clean.charCodeAt(i);
    if (code === 61 /* '=' */) break;
    const value = code < 256 ? lookup[code] : -1;
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

/** 每条会话的监听清理函数，closeNativeStream() 用它摘掉监听。 */
const pendingCleanup = new Map<string, () => void>();

/** Content-Type 归一化：`audio/mpeg; charset=x` → `audio/mpeg`。 */
export function normalizeContentType(raw?: string | null): string | undefined {
  const value = String(raw || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  return value || undefined;
}

/**
 * 打开一条原生取流会话并挂好事件监听。
 *
 * 顺序很关键：**先挂监听、再 start**，否则原生第一批数据可能在监听装好之前丢掉。
 * 返回时只保证"监听已就绪 + start 已被接受"；首个字节由调用方等 onChunk。
 */
export async function openNativeStream(
  url: string,
  id: string,
  handlers: NativeStreamHandlers,
): Promise<void> {
  const handles: NativeListenerHandle[] = [];
  let released = false;

  /** 只处理本条会话的事件：插件是多路复用的，别的 id 一概不理。 */
  const forThisStream = (fn: (event: NativeStreamEvent) => void) => (event: NativeStreamEvent) => {
    if (released) return;
    if (!event || event.id !== id) return;
    fn(event);
  };

  const removeAll = () => {
    released = true;
    for (const handle of handles) {
      void Promise.resolve()
        .then(() => handle.remove())
        .catch(() => undefined);
    }
    handles.length = 0;
  };

  const add = async (
    event: 'chunk' | 'type' | 'failed' | 'ended',
    fn?: (event: NativeStreamEvent) => void,
  ) => {
    if (!fn) return;
    const listener = forThisStream(fn);
    try {
      // 逐个分支写出：addListener 是按事件名重载的，联合类型过不了重载解析。
      if (event === 'chunk') handles.push(await StreamFetcher.addListener('chunk', listener));
      else if (event === 'type') handles.push(await StreamFetcher.addListener('type', listener));
      else if (event === 'failed') handles.push(await StreamFetcher.addListener('failed', listener));
      else handles.push(await StreamFetcher.addListener('ended', listener));
    } catch {
      // 监听注册失败不致命：真正的失败原因由 start() 的 reject 给出。
    }
  };

  await add('chunk', handlers.onChunk);
  await add('type', handlers.onType);
  await add('failed', handlers.onFailed);
  await add('ended', handlers.onEnded);

  try {
    await StreamFetcher.start({ url, id });
  } catch (err) {
    removeAll();
    throw err;
  }

  // 会话结束（或调用方提前关闭）时统一摘监听，避免插件事件表持续增长。
  pendingCleanup.set(id, removeAll);
}

/**
 * 关闭会话：停原生线程 + 摘监听 + 清状态。幂等，对"从未打开过"的 id 也安全。
 */
export async function closeNativeStream(id: string): Promise<void> {
  const cleanup = pendingCleanup.get(id);
  pendingCleanup.delete(id);
  if (cleanup) cleanup();
  try {
    await StreamFetcher.stop({ id });
  } catch {
    // 已经停止 / 插件缺席：无需上报。
  }
}

/** 上报消费回执（原生背压用）。失败时静默——最坏结果只是原生按无背压继续读。 */
export async function ackNativeStream(id: string, bytes: number): Promise<void> {
  if (!(bytes > 0)) return;
  try {
    await StreamFetcher.ack({ id, bytes });
  } catch {
    // 忽略
  }
}
