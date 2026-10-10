import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RADIO_API_BASES,
  RADIO_ERROR_MESSAGE,
  RadioBrowserError,
  dedupeStations,
  mapStation,
  searchStations,
  stationSubtitle,
  type RadioStation,
} from '@/lib/radio-browser';

/** 构造一条 radio-browser 原始条目（测试专用，全部是假数据）。 */
function rawStation(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    stationuuid: 'uuid-1',
    name: '  Test FM  ',
    url: 'http://example.org/stream',
    url_resolved: 'https://example.org/stream',
    codec: 'MP3',
    bitrate: 128,
    countrycode: 'cn',
    tags: ['pop', ' pop ', '', 'news'],
    homepage: 'https://example.org',
    favicon: 'https://example.org/favicon.png',
    ...over,
  };
}

function station(over: Partial<RadioStation> = {}): RadioStation {
  return {
    id: 'id',
    name: 'name',
    url: 'https://example.org/a',
    codec: 'MP3',
    bitrate: 128,
    country: 'CN',
    tags: [],
    homepage: '',
    favicon: '',
    unsupported: false,
    ...over,
  };
}

describe('mapStation', () => {
  it('归一化完整条目（去空白、国家码大写、标签去重）', () => {
    const s = mapStation(rawStation());
    expect(s).not.toBeNull();
    expect(s!.name).toBe('Test FM');
    expect(s!.id).toBe('uuid-1');
    expect(s!.url).toBe('https://example.org/stream');
    expect(s!.codec).toBe('MP3');
    expect(s!.bitrate).toBe(128);
    expect(s!.country).toBe('CN');
    expect(s!.tags).toEqual(['pop', 'news']);
    expect(s!.unsupported).toBe(false);
  });

  it('名字为空或缺失时丢弃', () => {
    expect(mapStation(rawStation({ name: '   ' }))).toBeNull();
    expect(mapStation(rawStation({ name: undefined }))).toBeNull();
    expect(mapStation(null)).toBeNull();
    expect(mapStation('nonsense')).toBeNull();
    expect(mapStation(undefined)).toBeNull();
  });

  it('没有可用 http(s) 地址时丢弃，并跳过非法 url_resolved 回退到 url', () => {
    expect(mapStation(rawStation({ url: '', url_resolved: '' }))).toBeNull();
    expect(mapStation(rawStation({ url: undefined, url_resolved: undefined }))).toBeNull();
    expect(mapStation(rawStation({ url: 'ftp://example.org/a.mp3', url_resolved: '' }))).toBeNull();
    expect(mapStation(rawStation({ url: 'not a url', url_resolved: '' }))).toBeNull();
    // url_resolved 非法 → 回退 url
    const fallback = mapStation(rawStation({ url_resolved: 'javascript:alert(1)' }));
    expect(fallback?.url).toBe('http://example.org/stream');
  });

  it('标记 HLS（codec 含 HLS 或地址以 .m3u8 结尾）为 unsupported', () => {
    expect(mapStation(rawStation({ codec: 'HLS' }))!.unsupported).toBe(true);
    expect(mapStation(rawStation({ codec: 'hls/aac' }))!.unsupported).toBe(true);
    expect(mapStation(rawStation({ url_resolved: 'https://example.org/live.m3u8' }))!.unsupported).toBe(
      true,
    );
    expect(
      mapStation(rawStation({ codec: 'MP3', url_resolved: 'https://example.org/a.mp3' }))!.unsupported,
    ).toBe(false);
  });

  it('兼容字符串标签、缺失 bitrate 与 url_resolved', () => {
    const s = mapStation(rawStation({ tags: 'jazz, blues ,jazz', bitrate: 'not a number', url_resolved: null }));
    expect(s!.tags).toEqual(['jazz', 'blues']);
    // 非法码率按 0 处理，不写入 NaN
    expect(s!.bitrate).toBe(0);
    // url_resolved 不可用 → 回退到 url
    expect(s!.url).toBe('http://example.org/stream');
  });

  it('缺少 stationuuid 且没有 id 时用 url 兜底做 id', () => {
    // 用 undefined 覆盖来“删字段”在不同转译器下不可靠，这里直接显式构造。
    const s = mapStation({
      stationuuid: undefined,
      id: undefined,
      name: 'Fallback FM',
      url: 'http://example.org/fallback',
      url_resolved: undefined,
      codec: 'MP3',
      bitrate: 96,
      countrycode: 'us',
    });
    expect(s).not.toBeNull();
    expect(s!.id).toBe('http://example.org/fallback');
    expect(s!.url).toBe('http://example.org/fallback');
    expect(s!.country).toBe('US');
  });
});

describe('dedupeStations', () => {
  it('按 url 去重并保留先出现的一条', () => {
    const list = [
      station({ id: 'a', url: 'https://example.org/1', name: 'first' }),
      station({ id: 'b', url: 'https://example.org/2' }),
      station({ id: 'c', url: 'https://example.org/1', name: 'duplicate' }),
    ];
    const out = dedupeStations(list);
    expect(out.map((s) => s.id)).toEqual(['a', 'b']);
    expect(out).toHaveLength(2);
  });

  it('容忍空输入与空 url 项', () => {
    expect(dedupeStations([])).toEqual([]);
    expect(dedupeStations([station({ url: '' }), station({ url: 'https://example.org/x' })])).toHaveLength(1);
  });
});

describe('stationSubtitle', () => {
  it('拼出 国家 · 编码 · 码率', () => {
    expect(stationSubtitle(station({ country: 'CN', codec: 'MP3', bitrate: 128 }))).toBe('中国 · MP3 · 128kbps');
  });

  it('缺字段时跳过对应段落', () => {
    expect(stationSubtitle(station({ country: '', codec: 'MP3', bitrate: 128 }))).toBe('MP3 · 128kbps');
    expect(stationSubtitle(station({ country: 'CN', codec: '', bitrate: 0 }))).toBe('中国');
    expect(stationSubtitle(station({ country: 'CN', codec: 'AAC', bitrate: 0 }))).toBe('中国 · AAC');
  });

  it('全部缺失时返回空串，非两位国家码原样显示', () => {
    expect(stationSubtitle(station({ country: '', codec: '', bitrate: 0 }))).toBe('');
    expect(stationSubtitle(station({ country: 'ZZTOP', codec: '', bitrate: 0 }))).toBe('ZZTOP');
  });
});

describe('searchStations', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  function jsonResponse(payload: unknown, ok = true, status = 200): Response {
    return {
      ok,
      status,
      json: async () => payload,
    } as unknown as Response;
  }

  it('用 name/limit/hidebroken/order 组装查询串并带 User-Agent', async () => {
    const mock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    mock.mockResolvedValue(jsonResponse([rawStation()]));

    const out = await searchStations('jazz', { limit: 5 });

    expect(mock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl.startsWith(`${RADIO_API_BASES[0]}/json/stations/search?`)).toBe(true);
    expect(calledUrl).toContain('name=jazz');
    expect(calledUrl).toContain('limit=5');
    expect(calledUrl).toContain('hidebroken=true');
    expect(calledUrl).toContain('order=clickcount');
    expect(calledUrl).toContain('reverse=true');
    expect(String((init.headers as Record<string, string>)['User-Agent'])).toContain('Endfield');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Test FM');
  });

  it('过滤不可用条目并按 url 去重', async () => {
    const mock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    mock.mockResolvedValue(
      jsonResponse([
        rawStation({ stationuuid: 'a', url_resolved: 'https://example.org/x' }),
        rawStation({ stationuuid: 'b', url_resolved: 'https://example.org/x' }),
        rawStation({ stationuuid: 'c', name: '' }),
        rawStation({ stationuuid: 'd', url_resolved: 'ftp://example.org/y', url: '' }),
      ]),
    );

    const out = await searchStations('x');
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('a');
  });

  it('第一个镜像失败时自动换下一个镜像', async () => {
    const mock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    mock
      .mockRejectedValueOnce(new TypeError('network down'))
      .mockResolvedValueOnce(jsonResponse([rawStation({ stationuuid: 'from-nl1' })]));

    const out = await searchStations('rock');

    expect(mock).toHaveBeenCalledTimes(2);
    expect(String(mock.mock.calls[0][0])).toContain(RADIO_API_BASES[0]);
    expect(String(mock.mock.calls[1][0])).toContain(RADIO_API_BASES[1]);
    expect(out[0].id).toBe('from-nl1');
  });

  it('HTTP 非 2xx 也视为该镜像失败并继续回退', async () => {
    const mock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    mock
      .mockResolvedValueOnce(jsonResponse([], false, 503))
      .mockResolvedValueOnce(jsonResponse([rawStation({ stationuuid: 'ok-2' })]));

    const out = await searchStations('pop');
    expect(mock).toHaveBeenCalledTimes(2);
    expect(out[0].id).toBe('ok-2');
  });

  it('全部镜像失败时抛出可读的 RadioBrowserError', async () => {
    const mock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    mock.mockRejectedValue(new TypeError('network down'));

    await expect(searchStations('anything')).rejects.toThrow(RadioBrowserError);
    await expect(searchStations('anything')).rejects.toThrow(RADIO_ERROR_MESSAGE);
    expect(mock).toHaveBeenCalledTimes(RADIO_API_BASES.length * 2);
  });

  it('空关键词不发请求，直接返回空数组', async () => {
    const mock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(await searchStations('   ')).toEqual([]);
    expect(mock).not.toHaveBeenCalled();
  });

  it('把调用方 signal 与内部超时串起来：外部取消会中断底层请求', async () => {
    const mock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const controller = new AbortController();
    let seen: AbortSignal | undefined;

    mock.mockImplementation((_url: string, init: RequestInit) => {
      seen = init.signal as AbortSignal;
      return new Promise((_resolve, reject) => {
        seen!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    });

    const pending = searchStations('live', { signal: controller.signal });
    await Promise.resolve();
    expect(seen).toBeInstanceOf(AbortSignal);
    expect(seen!.aborted).toBe(false);

    controller.abort();
    await expect(pending).rejects.toThrow();
    expect(seen!.aborted).toBe(true);
    // 外部取消后不再尝试后面的镜像
    expect(mock).toHaveBeenCalledTimes(1);
  });
});
