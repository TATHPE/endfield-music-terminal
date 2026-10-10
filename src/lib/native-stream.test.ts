// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 插件替身：形状与真机上的 StreamFetcher 代理一致（多路复用事件 + promise 方法）。
// 用 vi.doMock 换掉 @capacitor/core，再动态 import 被测模块，保证拿到替身。

interface PluginEvent {
  id: string;
  data?: string;
  bytes?: number;
  type?: string;
  message?: string;
}

type Handler = (event: PluginEvent) => void;

interface FakePlugin {
  addListener: (event: string, handler: Handler) => Promise<{ remove: () => Promise<void> }>;
  start: (options: { url: string; id: string }) => Promise<void>;
  ack: (options: { id: string; bytes: number }) => Promise<void>;
  stop: (options: { id: string }) => Promise<void>;
}

let listeners: Map<string, Handler>;
let calls: string[];
let startArgs: Array<{ url: string; id: string }>;
let acks: Array<{ id: string; bytes: number }>;
let stops: string[];
let startImpl: (options: { url: string; id: string }) => Promise<void>;
let stopImpl: (options: { id: string }) => Promise<void>;

function installFakeCapacitor() {
  listeners = new Map();
  calls = [];
  startArgs = [];
  acks = [];
  stops = [];
  startImpl = (options) => {
    startArgs.push(options);
    return Promise.resolve();
  };
  stopImpl = (options) => {
    stops.push(options.id);
    return Promise.resolve();
  };

  const fake: FakePlugin = {
    addListener: (event, handler) => {
      listeners.set(event, handler);
      calls.push(`listen:${event}`);
      return Promise.resolve({
        remove: () => {
          calls.push(`remove:${event}`);
          listeners.delete(event);
          return Promise.resolve();
        },
      });
    },
    start: (options) => {
      calls.push('start');
      return startImpl(options);
    },
    ack: (options) => {
      acks.push(options);
      return Promise.resolve();
    },
    stop: (options) => stopImpl(options),
  };

  vi.doMock('@capacitor/core', () => ({
    Capacitor: {
      isNativePlatform: () => true,
      isPluginAvailable: () => true,
      getPlatform: () => 'android',
    },
    registerPlugin: () => fake,
  }));
}

/** 动态 import：拿到的是装了替身插件的模块实例。 */
async function load() {
  return import('@/lib/native-stream');
}

const encode = (bytes: number[]) => Buffer.from(bytes).toString('base64');

beforeEach(() => {
  installFakeCapacitor();
});

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('@capacitor/core');
  vi.restoreAllMocks();
});

describe('isNativeStreamAvailable', () => {
  it('uses the injected probe instead of the real Capacitor check', async () => {
    const mod = await load();
    expect(mod.isNativeStreamAvailable(() => false)).toBe(false);
    expect(mod.isNativeStreamAvailable(() => true)).toBe(true);
  });

  it('reports true when the native bridge advertises the plugin', async () => {
    const mod = await load();
    expect(mod.isNativeStreamAvailable()).toBe(true);
  });
});

describe('decodeBase64', () => {
  it('decodes to the exact original bytes', async () => {
    const { decodeBase64 } = await load();
    expect(Array.from(decodeBase64(encode([0, 1, 2, 253, 254, 255])))).toEqual([0, 1, 2, 253, 254, 255]);
  });

  it('returns an empty array for empty or missing input', async () => {
    const { decodeBase64 } = await load();
    expect(decodeBase64('').byteLength).toBe(0);
    expect(decodeBase64(undefined as unknown as string).byteLength).toBe(0);
  });

  it('ignores padding and surrounding whitespace', async () => {
    // 原生侧用 NO_WRAP，正常情况下没有换行，但也要容忍。
    const { decodeBase64 } = await load();
    expect(Array.from(decodeBase64('  QUJD\n'))).toEqual([65, 66, 67]);
    expect(Array.from(decodeBase64('QUJD'))).toEqual([65, 66, 67]);
  });

  it('round-trips every byte value', async () => {
    const { decodeBase64 } = await load();
    const all = Array.from({ length: 256 }, (_, i) => i);
    expect(Array.from(decodeBase64(encode(all)))).toEqual(all);
  });

  it('handles a chunk-sized payload', async () => {
    const { decodeBase64 } = await load();
    const chunk = Array.from({ length: 16 * 1024 }, (_, i) => i % 251);
    expect(decodeBase64(encode(chunk)).byteLength).toBe(16 * 1024);
  });
});

describe('normalizeContentType', () => {
  it('strips parameters and lowercases', async () => {
    const { normalizeContentType } = await load();
    expect(normalizeContentType('audio/mpeg; charset=utf-8')).toBe('audio/mpeg');
    expect(normalizeContentType('Audio/MP3')).toBe('audio/mp3');
  });

  it('returns undefined for missing or blank values', async () => {
    const { normalizeContentType } = await load();
    expect(normalizeContentType(undefined)).toBeUndefined();
    expect(normalizeContentType(null)).toBeUndefined();
    expect(normalizeContentType('   ')).toBeUndefined();
  });
});

describe('openNativeStream', () => {
  it('installs every listener before start() runs', async () => {
    const { openNativeStream } = await load();
    await openNativeStream('https://ice.example/lush', 'id-1', {
      onChunk: () => undefined,
      onType: () => undefined,
      onFailed: () => undefined,
      onEnded: () => undefined,
    });

    // 顺序是关键：先挂监听再 start，否则原生第一批数据会丢。
    expect(calls).toEqual(['listen:chunk', 'listen:type', 'listen:failed', 'listen:ended', 'start']);
    expect(startArgs).toEqual([{ url: 'https://ice.example/lush', id: 'id-1' }]);
  });

  it('skips listeners the caller did not provide', async () => {
    const { openNativeStream } = await load();
    await openNativeStream('https://ice.example/lush', 'id-2', { onChunk: () => undefined });
    expect(calls).toEqual(['listen:chunk', 'start']);
  });

  it('routes events for its own id and ignores other sessions', async () => {
    const { openNativeStream } = await load();
    const chunks: PluginEvent[] = [];
    const failed: PluginEvent[] = [];
    await openNativeStream('https://ice.example/lush', 'id-3', {
      onChunk: (event) => chunks.push(event),
      onFailed: (event) => failed.push(event),
    });

    listeners.get('chunk')?.({ id: 'someone-else', data: encode([1]) });
    listeners.get('chunk')?.({ id: 'id-3', data: encode([1, 2, 3]) });
    listeners.get('failed')?.({ id: 'id-3', message: 'HTTP 403 Forbidden' });

    expect(chunks).toHaveLength(1);
    expect(chunks[0].data).toBe(encode([1, 2, 3]));
    expect(failed).toHaveLength(1);
  });

  it('cleans up every listener when start() is rejected', async () => {
    const { openNativeStream } = await load();
    startImpl = () => Promise.reject(new Error('不支持 http 明文流（混合内容限制），请改用 https 地址'));

    await expect(
      openNativeStream('https://ice.example/lush', 'id-4', {
        onChunk: () => undefined,
        onEnded: () => undefined,
      }),
    ).rejects.toThrow('不支持 http 明文流');

    expect(calls.filter((c) => c.startsWith('remove:'))).toEqual(['remove:chunk', 'remove:ended']);
  });

  it('stops delivering events once the stream is closed', async () => {
    const { openNativeStream, closeNativeStream } = await load();
    const chunks: PluginEvent[] = [];
    await openNativeStream('https://ice.example/lush', 'id-5', {
      onChunk: (event) => chunks.push(event),
    });
    const chunkListener = listeners.get('chunk');

    await closeNativeStream('id-5');
    // 摘监听本身是异步的（handle.remove() 走 Promise），但 released 标记立刻生效。
    chunkListener?.({ id: 'id-5', data: encode([9]) });
    expect(chunks).toHaveLength(0);
  });
});

describe('closeNativeStream', () => {
  it('forwards the id to the native stop()', async () => {
    const { closeNativeStream } = await load();
    await closeNativeStream('id-6');
    expect(stops).toEqual(['id-6']);
  });

  it('never throws for an unknown id or a rejecting plugin', async () => {
    const { closeNativeStream } = await load();
    await closeNativeStream('never-opened');
    stopImpl = () => Promise.reject(new Error('plugin missing'));
    await expect(closeNativeStream('never-opened')).resolves.toBeUndefined();
  });
});

describe('ackNativeStream', () => {
  it('reports consumed byte counts to the plugin', async () => {
    const { ackNativeStream } = await load();
    await ackNativeStream('id-7', 16384);
    expect(acks).toEqual([{ id: 'id-7', bytes: 16384 }]);
  });

  it('skips non-positive counts', async () => {
    const { ackNativeStream } = await load();
    await ackNativeStream('id-8', 0);
    expect(acks).toHaveLength(0);
  });
});
