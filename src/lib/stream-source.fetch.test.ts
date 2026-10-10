import { afterEach, describe, expect, it, vi } from 'vitest';
import { StreamSourceError, fetchStreamSource } from '@/lib/stream-source';

// fetch 通道是 web 构建的主路径，也是原生插件缺席时的回退。这里的断言重点是
// **错误文案与历史行为完全一致**（真机日志里已经出现过这些句子，不能改词）。

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

describe('fetchStreamSource', () => {
  it('yields the response body chunk by chunk', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => responseWith([[1, 2], [3]], { contentType: 'audio/mpeg' })));
    const source = await fetchStreamSource('https://ice.example/a.mp3', new AbortController().signal);
    const out: number[][] = [];
    for await (const chunk of source.values()) out.push(Array.from(chunk));
    expect(out).toEqual([[1, 2], [3]]);
  });

  it('reports the normalized server Content-Type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => responseWith([], { contentType: 'audio/mpeg; charset=utf-8' })),
    );
    const source = await fetchStreamSource('https://ice.example/a', new AbortController().signal);
    expect(source.type).toBe('audio/mpeg');
    expect(source.channel).toBe('fetch');
    source.stop();
  });

  it('keeps the historical 403 message verbatim', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => responseWith([], { status: 403, statusText: 'Forbidden' })),
    );
    const promise = fetchStreamSource('https://ice.example/a', new AbortController().signal);
    await expect(promise).rejects.toThrow('该电台流返回错误状态 HTTP 403 Forbidden');
    await promise.catch((err: unknown) => {
      expect(err).toBeInstanceOf(StreamSourceError);
      expect((err as StreamSourceError).status).toBe(403);
      expect((err as StreamSourceError).channel).toBe('fetch');
    });
  });

  it('keeps the historical network-failure message verbatim', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(
      fetchStreamSource('https://ice.example/a', new AbortController().signal),
    ).rejects.toThrow('该电台流拉取失败（可能不支持跨域或网络不可达）— TypeError: Failed to fetch');
  });

  it('reports a response without a readable body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => responseWith([], { noBody: true })));
    await expect(
      fetchStreamSource('https://ice.example/a', new AbortController().signal),
    ).rejects.toThrow('该电台流没有返回可读取的数据体');
  });

  it('sends no Icy-MetaData header (that is what mangles the body)', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) => responseWith([], { contentType: 'audio/mpeg' }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const source = await fetchStreamSource('https://ice.example/a', new AbortController().signal);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.cache).toBe('no-store');
    expect(init.credentials).toBe('omit');
    expect(JSON.stringify(init.headers)).not.toMatch(/icy-metadata/i);
    source.stop();
  });

  it('stops the reader when the source is stopped', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => responseWith([[1]], { contentType: 'audio/mpeg' })));
    const source = await fetchStreamSource('https://ice.example/a', new AbortController().signal);
    source.stop();
    source.stop(); // 幂等
    const out: number[][] = [];
    for await (const chunk of source.values()) out.push(Array.from(chunk));
    expect(out).toEqual([]);
  });
});
