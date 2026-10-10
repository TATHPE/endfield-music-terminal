import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NativeStreamEvent, NativeStreamHandlers } from '@/lib/native-stream';
import {
  createStreamSource,
  nativeStreamSource,
  preferredStreamChannel,
  type NativeStreamApi,
  type StreamSource,
} from '@/lib/stream-source';

// 原生通道用"假 API"注入（不 mock 模块加载器）：这里只验证"事件 → 字节来源"
// 的编排（队列 / ack / 错误面 / 幂等），插件自身的解码与事件顺序由
// native-stream.test.ts 覆盖。

interface FakeNative extends NativeStreamApi {
  /** 按 url 保存 handler，测试据此派发事件。 */
  sent: Map<string, NativeStreamHandlers>;
  /** 打开时同步推送的首批字节（真实原生也是先推字节再让 start 返回）。 */
  primeOnOpen: (url: string, bytes: number[]) => void;
  closed: string[];
  acked: Array<{ id: string; bytes: number }>;
  available: boolean;
}

function makeFakeNative(): FakeNative {
  const sent = new Map<string, NativeStreamHandlers>();
  const closed: string[] = [];
  const acked: Array<{ id: string; bytes: number }> = [];
  let prime: { url: string; bytes: number[] } | null = null;

  const fake: FakeNative = {
    sent,
    closed,
    acked,
    available: true,
    primeOnOpen: (url, bytes) => {
      prime = { url, bytes };
    },
    isAvailable: () => fake.available,
    open: async (url, _id, handlers) => {
      sent.set(url, handlers);
      if (prime && prime.url === url) {
        // 关键：首批字节在 open 内部同步推来（await 链一恢复就能看到），
        // 否则 JS 侧无法在 createStreamSource 等首批字节期间插入事件。
        handlers.onChunk({ id: 'x', data: Buffer.from(prime.bytes).toString('base64') });
      }
    },
    close: async (id) => {
      closed.push(id);
    },
    ack: async (id, bytes) => {
      acked.push({ id, bytes });
    },
  };
  return fake;
}

const encode = (bytes: number[]) => Buffer.from(bytes).toString('base64');

function emit(
  fake: FakeNative,
  url: string,
  event: 'chunk' | 'type' | 'failed' | 'ended',
  payload: Partial<NativeStreamEvent> = {},
) {
  const h = fake.sent.get(url);
  if (!h) throw new Error(`no native session for ${url}`);
  if (event === 'chunk') h.onChunk({ id: 'x', ...payload });
  else if (event === 'type') h.onType?.({ id: 'x', ...payload });
  else if (event === 'failed') h.onFailed?.({ id: 'x', ...payload });
  else h.onEnded?.({ id: 'x', ...payload });
}

async function collect(source: StreamSource, limit = 10): Promise<number[][]> {
  const out: number[][] = [];
  for await (const chunk of source.values()) {
    out.push(Array.from(chunk));
    if (out.length >= limit) break;
  }
  return out;
}

function responseWith(
  chunks: number[][],
  init?: { status?: number; statusText?: string; contentType?: string; noBody?: boolean },
): Response {
  const body = init?.noBody
    ? null
    : new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(new Uint8Array(chunk));
          controller.close();
        },
      });
  return new Response(body, {
    status: init?.status ?? 200,
    statusText: init?.statusText ?? 'OK',
    headers: init?.contentType ? { 'content-type': init.contentType } : undefined,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('preferredStreamChannel', () => {
  it('prefers native when the plugin is available', () => {
    expect(preferredStreamChannel(() => true)).toBe('native');
    expect(preferredStreamChannel(undefined, { isAvailable: () => true })).toBe('native');
  });

  it('falls back to fetch when the plugin is missing', () => {
    expect(preferredStreamChannel(() => false)).toBe('fetch');
    expect(preferredStreamChannel(undefined, { isAvailable: () => false })).toBe('fetch');
  });

  it('reports fetch on plain Node (no native bridge)', () => {
    expect(preferredStreamChannel()).toBe('fetch');
  });
});

describe('createStreamSource', () => {
  it('selects the native channel when the probe says it is available', async () => {
    const native = makeFakeNative();
    native.primeOnOpen('https://ice.example/probe', [1]);
    const source = await createStreamSource('https://ice.example/probe', new AbortController().signal, {
      nativeProbe: () => true,
      native,
    });
    expect(source.channel).toBe('native');
    expect(native.sent.has('https://ice.example/probe')).toBe(true);
    source.stop();
  });

  it('uses the injected native api to decide the default channel', async () => {
    const native = makeFakeNative();
    native.primeOnOpen('https://ice.example/auto', [1]);
    const source = await createStreamSource('https://ice.example/auto', new AbortController().signal, {
      native,
    });
    expect(source.channel).toBe('native');
    source.stop();
  });

  it('honours an explicit channel override', async () => {
    const fetchMock = vi.fn(async () => responseWith([[1, 2, 3]], { contentType: 'audio/mpeg' }));
    vi.stubGlobal('fetch', fetchMock);
    const source = await createStreamSource('https://ice.example/forced', new AbortController().signal, {
      prefer: 'fetch',
      native: makeFakeNative(),
    });
    expect(source.channel).toBe('fetch');
    source.stop();
  });

  it('falls back to fetch when the native probe is false', async () => {
    const native = makeFakeNative();
    const fetchMock = vi.fn(async () => responseWith([[7]], { contentType: 'audio/mpeg' }));
    vi.stubGlobal('fetch', fetchMock);
    const source = await createStreamSource('https://ice.example/web', new AbortController().signal, {
      nativeProbe: () => false,
      native,
    });
    expect(source.channel).toBe('fetch');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    source.stop();
  });
});

describe('nativeStreamSource', () => {
  it('yields decoded chunks in arrival order with the server type', async () => {
    const native = makeFakeNative();
    const url = 'https://ice.example/lush';
    native.primeOnOpen(url, [1, 2, 3]);
    const source = await nativeStreamSource(url, new AbortController().signal, native);

    emit(native, url, 'type', { type: 'audio/mpeg; charset=utf-8' });
    emit(native, url, 'chunk', { data: encode([4, 5]) });
    emit(native, url, 'ended', {});

    expect(source.channel).toBe('native');
    expect(source.type).toBe('audio/mpeg');
    await expect(collect(source)).resolves.toEqual([
      [1, 2, 3],
      [4, 5],
    ]);
  });

  it('acks every delivered batch (native backpressure)', async () => {
    const native = makeFakeNative();
    const url = 'https://ice.example/ack';
    native.primeOnOpen(url, [1, 2, 3]);
    const source = await nativeStreamSource(url, new AbortController().signal, native);
    // 首批字节一到就回执（原生据此判断能否继续读）。
    expect(native.acked.map((a) => a.bytes)).toEqual([3]);

    emit(native, url, 'chunk', { data: encode([4, 5]) });
    expect(native.acked.map((a) => a.bytes)).toEqual([3, 2]);

    // 消费两批（结束后主动收尾，避免等下一批）。
    const seen = await collect(source, 2);
    emit(native, url, 'ended', {});
    source.stop();

    expect(seen).toEqual([
      [1, 2, 3],
      [4, 5],
    ]);
    // 消费本身不再补发回执，且每批都带会话 id。
    expect(native.acked.map((a) => a.bytes)).toEqual([3, 2]);
    expect(native.acked.every((a) => typeof a.id === 'string' && a.id.length > 0)).toBe(true);
  });

  // 回归：首批字节到达后 awaitAny 不能立刻返回，否则消费循环会忙等/死循环。
  it('waits quietly for the next batch instead of spinning', async () => {
    const native = makeFakeNative();
    const url = 'https://ice.example/wait';
    native.primeOnOpen(url, [1]);
    const source = await nativeStreamSource(url, new AbortController().signal, native);

    const seen: number[][] = [];
    const consume = (async () => {
      for await (const chunk of source.values()) {
        seen.push(Array.from(chunk));
        if (seen.length === 1) {
          // 队列已空：必须挂起等待，而不是空转。
          await new Promise((resolve) => setTimeout(resolve, 20));
          emit(native, url, 'ended', {});
        }
      }
    })();

    await consume;
    expect(seen).toEqual([[1]]);
  });

  it('closes the native session once the stream ends', async () => {
    const native = makeFakeNative();
    const url = 'https://ice.example/eof';
    native.primeOnOpen(url, [1]);
    const source = await nativeStreamSource(url, new AbortController().signal, native);
    emit(native, url, 'ended', {});

    await collect(source);
    expect(native.closed).toHaveLength(1);
  });

  it('returns early on ended with no data at all', async () => {
    const native = makeFakeNative();
    const url = 'https://ice.example/empty';
    const promise = nativeStreamSource(url, new AbortController().signal, native);
    // open 是 async：等一个微任务，handler 就已注册。
    await Promise.resolve();
    emit(native, url, 'ended', {});
    await expect(promise).rejects.toThrow('流已结束且没有数据');
  });

  it('maps an HTTP 403 failure to a 原生取流失败 message', async () => {
    const native = makeFakeNative();
    const url = 'https://ice.example/forbidden';
    const promise = nativeStreamSource(url, new AbortController().signal, native);
    await Promise.resolve();
    emit(native, url, 'failed', { message: 'HTTP 403 Forbidden（取流被拒绝）' });
    await expect(promise).rejects.toThrow('原生取流失败（HTTP 403 Forbidden）');
  });

  it('keeps the status code on the error', async () => {
    const native = makeFakeNative();
    const url = 'https://ice.example/forbidden2';
    const promise = nativeStreamSource(url, new AbortController().signal, native);
    await Promise.resolve();
    emit(native, url, 'failed', { message: 'HTTP 403 Forbidden（取流被拒绝）' });
    await promise.catch((err: unknown) => {
      expect((err as { status?: number }).status).toBe(403);
    });
  });

  it('maps an unreachable host to a 网络不可达 message', async () => {
    const native = makeFakeNative();
    const url = 'https://ice.example/offline';
    const promise = nativeStreamSource(url, new AbortController().signal, native);
    await Promise.resolve();
    emit(native, url, 'failed', { message: 'Unable to resolve host "ice.example"' });
    await expect(promise).rejects.toThrow('原生取流失败（网络不可达）');
  });

  it('surfaces a mid-stream failure while consuming', async () => {
    const native = makeFakeNative();
    const url = 'https://ice.example/drop';
    native.primeOnOpen(url, [9]);
    const source = await nativeStreamSource(url, new AbortController().signal, native);

    const seen: number[][] = [];
    const consume = (async () => {
      for await (const chunk of source.values()) {
        seen.push(Array.from(chunk));
        emit(native, url, 'failed', { message: '连接中断（对端关闭）' });
      }
    })();

    await expect(consume).rejects.toThrow('原生取流失败（连接中断）');
    expect(seen).toEqual([[9]]);
  });

  it('stops yielding once the source is closed', async () => {
    const native = makeFakeNative();
    const url = 'https://ice.example/abort';
    native.primeOnOpen(url, [1]);
    const source = await nativeStreamSource(url, new AbortController().signal, native);
    source.stop();
    await expect(collect(source)).resolves.toEqual([]);
    expect(native.closed).toHaveLength(1);
  });

  it('is idempotent: stop() twice closes the native session once', async () => {
    const native = makeFakeNative();
    const url = 'https://ice.example/idem';
    native.primeOnOpen(url, [1]);
    const source = await nativeStreamSource(url, new AbortController().signal, native);
    source.stop();
    source.stop();
    expect(native.closed).toHaveLength(1);
  });

  it('closes the native session when the signal aborts', async () => {
    const native = makeFakeNative();
    const url = 'https://ice.example/signal';
    native.primeOnOpen(url, [1]);
    const controller = new AbortController();
    const source = await nativeStreamSource(url, controller.signal, native);
    controller.abort();
    await expect(collect(source)).resolves.toEqual([]);
    expect(native.closed).toHaveLength(1);
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const native = makeFakeNative();
    const controller = new AbortController();
    controller.abort();
    await expect(
      nativeStreamSource('https://ice.example/dead', controller.signal, native),
    ).rejects.toThrow('在线流播放已停止');
  });

  it('reports a plugin start() rejection as a 原生取流失败 reason', async () => {
    const native = makeFakeNative();
    native.open = async () => {
      throw new Error('"StreamFetcher" plugin is not implemented on web');
    };
    await expect(
      nativeStreamSource('https://ice.example/noplugin', new AbortController().signal, native),
    ).rejects.toThrow('原生取流失败（"StreamFetcher" plugin is not implemented on web）');
  });

  it('keeps the mixed-content message from the native guard verbatim', async () => {
    const native = makeFakeNative();
    native.open = async () => {
      throw new Error('不支持 http 明文流（混合内容限制），请改用 https 地址');
    };
    await expect(
      nativeStreamSource('http://ice.example/plain', new AbortController().signal, native),
    ).rejects.toThrow('不支持 http 明文流（混合内容限制），请改用 https 地址');
  });
});
