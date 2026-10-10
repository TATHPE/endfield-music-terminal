// EXPORTS: StreamSource, StreamSourceError, NativeStreamApi, StreamSourceOptions,
//          createStreamSource, preferredStreamChannel, fetchStreamSource,
//          nativeStreamSource, describeStreamSourceError
//
// 在线流的"字节来源"抽象层：MSE 播放器只关心"下一批字节从哪来"，不关心是
// 浏览器 fetch 拉的还是原生插件推的。
//
// 两条通道：
//  - native：Capacitor 插件 StreamFetcher（HttpURLConnection，不带 Origin，
//    绕过热链保护；原生侧有 ack 背压）。
//  - fetch：浏览器 fetch（web 构建 / 插件缺席时的回退，也是历史行为）。
//
// 选择策略：原生可用时优先原生，否则回退 fetch。通道名会写进 SYSTEM LOG
// （`MSE OPEN — ... via=native|fetch`），真机上一眼能看出走的哪条路。

import {
  ackNativeStream,
  closeNativeStream,
  decodeBase64,
  isNativeStreamAvailable,
  normalizeContentType,
  openNativeStream,
  type NativeStreamEvent,
  type NativeStreamHandlers,
  type NativeStreamProbe,
} from '@/lib/native-stream';

/** 取流通道标识。 */
export type StreamChannel = 'native' | 'fetch';

/** fetch 通道请求参数：与既有行为完全一致（不发 Icy-MetaData）。 */
const FETCH_INIT: RequestInit = {
  method: 'GET',
  cache: 'no-store',
  redirect: 'follow',
  credentials: 'omit',
  headers: { Accept: 'audio/mpeg, audio/*;q=0.9, */*;q=0.8' },
};

/** 原生通道等首批字节的上限（对齐原生侧 15s 连接/读取超时）。 */
const NATIVE_FIRST_CHUNK_TIMEOUT_MS = 20000;
/** 之后每批之间的停滞上限：正常 128kbps + 500ms 攒批 ≈ 每隔一两秒一批。 */
const NATIVE_STALL_TIMEOUT_MS = 45000;

/** 取流失败。status 仅在服务端明确回了一个 HTTP 状态码时存在。 */
export class StreamSourceError extends Error {
  readonly channel: StreamChannel;
  readonly status?: number;

  constructor(message: string, channel: StreamChannel, status?: number) {
    super(message);
    this.name = 'StreamSourceError';
    this.channel = channel;
    this.status = status;
  }
}

/** 统一字节来源：MSE 播放器只用它。 */
export interface StreamSource {
  /** 服务端 Content-Type 归一化后的结果（可能为 undefined）。 */
  readonly type?: string;
  /** 实际生效的取流通道。 */
  readonly channel: StreamChannel;
  /** 逐批取字节；失败抛 StreamSourceError，流结束正常返回。 */
  values(): AsyncGenerator<Uint8Array, void, undefined>;
  /** 关闭来源，幂等。 */
  stop(): void;
}

function isHttpStatusError(message: string): boolean {
  return /HTTP \d{3}/.test(message);
}

/** 错误摘要，用于拼中文提示（沿用 mse-stream.ts 的历史格式）。 */
function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

/**
 * 原生通道依赖面（可注入）。
 *
 * 生产环境固定用 src/lib/native-stream.ts 的实现；把这一层显式抽出来，
 * 单测可以注入一个"能同步推首批字节"的假实现，不必去 mock 模块加载器。
 */
export interface NativeStreamApi {
  isAvailable(): boolean;
  open(url: string, id: string, handlers: NativeStreamHandlers): Promise<void>;
  close(id: string): Promise<void>;
  ack(id: string, bytes: number): Promise<void>;
}

const defaultNativeApi: NativeStreamApi = {
  isAvailable: () => isNativeStreamAvailable(),
  open: (url, id, handlers) => openNativeStream(url, id, handlers),
  close: (id) => closeNativeStream(id),
  ack: (id, bytes) => ackNativeStream(id, bytes),
};

export interface StreamSourceOptions {
  /** 取流通道探针，默认用真实 Capacitor 能力检测（单测可注入）。 */
  nativeProbe?: NativeStreamProbe;
  /** 强制通道（用于验证/联调）；缺省按策略自动选择。 */
  prefer?: StreamChannel;
  /** 原生通道依赖（默认走真实插件，单测可注入）。 */
  native?: NativeStreamApi;
}

/** 策略：原生可用时优先原生，否则 fetch。 */
export function preferredStreamChannel(
  probe?: NativeStreamProbe,
  native?: Pick<NativeStreamApi, 'isAvailable'>,
): StreamChannel {
  if (probe) return probe() ? 'native' : 'fetch';
  return (native ?? defaultNativeApi).isAvailable() ? 'native' : 'fetch';
}

/**
 * 按策略挑一条通道并打开。抛出的错误一律是 StreamSourceError，
 * 调用方据此拼中文提示（fetch 通道的文案与历史完全一致）。
 */
export async function createStreamSource(
  url: string,
  signal: AbortSignal,
  opts?: StreamSourceOptions,
): Promise<StreamSource> {
  const native = opts?.native ?? defaultNativeApi;
  const channel = opts?.prefer ?? preferredStreamChannel(opts?.nativeProbe, native);
  if (channel === 'native') return nativeStreamSource(url, signal, native);
  return fetchStreamSource(url, signal);
}

// --- fetch 通道（web 构建 / 插件缺席的回退，行为与历史一致） ----------------

export async function fetchStreamSource(url: string, signal: AbortSignal): Promise<StreamSource> {
  let response: Response;
  try {
    response = await fetch(url, { ...FETCH_INIT, signal });
  } catch (err) {
    throw new StreamSourceError(
      `该电台流拉取失败（可能不支持跨域或网络不可达）— ${describe(err)}`,
      'fetch',
    );
  }
  if (!response.ok) {
    throw new StreamSourceError(
      `该电台流返回错误状态 HTTP ${response.status} ${response.statusText}`.trim(),
      'fetch',
      response.status,
    );
  }
  const body = response.body;
  if (!body) throw new StreamSourceError('该电台流没有返回可读取的数据体', 'fetch');

  const reader = body.getReader();
  const onAbort = () => {
    void reader.cancel().catch(() => undefined);
  };
  if (signal.aborted) onAbort();
  else signal.addEventListener('abort', onAbort);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    signal.removeEventListener('abort', onAbort);
    void reader.cancel().catch(() => undefined);
  };

  return {
    type: normalizeContentType(response.headers.get('content-type')),
    channel: 'fetch',
    async *values() {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) return;
          if (!value || value.byteLength === 0) continue;
          yield value;
        }
      } finally {
        close();
      }
    },
    stop: close,
  };
}

// --- 原生通道 --------------------------------------------------------------

interface NativeSession {
  /** 已投递给消费方、但还没 ack 的字节数。 */
  unacked: number;
  /** 事件线程推进来的待消费批次。 */
  pending: Uint8Array[];
  type?: string;
  firstChunk: boolean;
  ended: boolean;
  failed: string | null;
  closed: boolean;
}

/**
 * 打开原生取流通道。
 *
 * 背压由原生侧实施：这里每投递一批就 ack 一次（未确认字节超阈值时原生会暂停
 * 读取），所以"消费得慢"自然会把源头拖慢，不需要 JS 侧再排队。
 */
export async function nativeStreamSource(
  url: string,
  signal: AbortSignal,
  api: NativeStreamApi = defaultNativeApi,
): Promise<StreamSource> {
  const id = `sf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const session: NativeSession = {
    unacked: 0,
    pending: [],
    firstChunk: false,
    ended: false,
    failed: null,
    closed: false,
  };

  let wake: (() => void) | null = null;
  const notify = () => {
    const fn = wake;
    wake = null;
    fn?.();
  };

  /**
   * 等"有东西可消费"。
   *
   * 注意条件里**不能**带 firstChunk：首批字节到达之后它就永远是 true，
   * 消费循环会变成"立刻返回 → 队列还是空 → 再等"的忙等（微任务死循环）。
   * 首批字节的等待由调用方用"队列非空"判断。
   */
  const awaitAny = () =>
    new Promise<void>((resolve) => {
      if (session.pending.length > 0 || session.ended || session.failed || session.closed) {
        resolve();
        return;
      }
      wake = resolve;
    });

  const onChunk = (event: NativeStreamEvent) => {
    const bytes = decodeBase64(event.data ?? '');
    if (bytes.byteLength > 0) {
      session.pending.push(bytes);
      session.unacked += bytes.byteLength;
      session.firstChunk = true;
      notify();
    }
    // 立刻回执：原生侧的背压以 ack 为准，不需要等 MSE 真正 append 完。
    const acked = session.unacked;
    session.unacked = 0;
    void api.ack(id, acked);
  };
  const onType = (event: NativeStreamEvent) => {
    const type = normalizeContentType(event.type);
    if (type) session.type = type;
  };
  const onFailed = (event: NativeStreamEvent) => {
    session.failed = String(event.message || '').trim() || '连接中断';
    notify();
  };
  const onEnded = () => {
    session.ended = true;
    notify();
  };

  /** 停止：清队列（已消费的字节不再回执）+ 通知原生关闭。幂等。 */
  const close = () => {
    if (session.closed) return;
    session.closed = true;
    session.pending.length = 0;
    signal.removeEventListener('abort', onAbort);
    notify();
    void api.close(id);
  };
  const onAbort = () => close();
  if (signal.aborted) {
    throw new StreamSourceError('在线流播放已停止', 'native');
  }
  signal.addEventListener('abort', onAbort);

  try {
    await api.open(url, id, { onChunk, onType, onFailed, onEnded });
  } catch (err) {
    close();
    throw nativeOpenError(err);
  }

  // 等首批字节：拿到 Content-Type 才好决定 SourceBuffer 的 MIME。
  const settled = await raceFirstChunk(awaitAny(), NATIVE_FIRST_CHUNK_TIMEOUT_MS);
  if (!settled) {
    close();
    throw new StreamSourceError('原生取流失败（连接超时）', 'native');
  }  if (session.failed) {
    const reason = session.failed;
    close();
    throw nativeFailureError(reason);
  }
  if (session.closed) throw new StreamSourceError('在线流播放已停止', 'native');
  if (session.ended && !session.firstChunk) {
    close();
    throw new StreamSourceError('原生取流失败（流已结束且没有数据）', 'native');
  }

  return {
    // getter：Content-Type 事件可能在返回之后才到，取用时再读最新值。
    get type() {
      return session.type;
    },
    channel: 'native',
    async *values() {
      try {
        for (;;) {
          if (session.pending.length > 0) {
            const chunk = session.pending.shift() as Uint8Array;
            yield chunk;
            continue;
          }
          if (session.failed) throw nativeFailureError(session.failed);
          if (session.ended || session.closed) return;
          // 队列为空：等下一批 / 结束 / 失败。
          const ok = await raceFirstChunk(awaitAny(), NATIVE_STALL_TIMEOUT_MS);
          if (!ok) throw new StreamSourceError('原生取流失败（连接中断）', 'native');
        }
      } finally {
        close();
      }
    },
    stop: close,
  };
}

/** 让 await 与超时竞争；true 表示在超时前被唤醒。 */
async function raceFirstChunk(waiting: Promise<void>, timeoutMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      waiting.then(() => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** 插件 start() 被 reject —— 参数非法 / http 明文 / 插件缺席。 */
function nativeOpenError(err: unknown): StreamSourceError {
  const message = err instanceof Error ? err.message : String(err);
  if (/http 明文/.test(message)) return new StreamSourceError(message, 'native');
  return new StreamSourceError(`原生取流失败（${message}）`, 'native');
}

/**
 * failed 事件 → 用户可读原因。
 * 形如 `HTTP 403 Forbidden（取流被拒绝）` → 「原生取流失败（HTTP 403 Forbidden）」。
 */
function nativeFailureError(reason: string): StreamSourceError {
  const match = /HTTP (\d{3})/.exec(reason);
  const status = match ? Number(match[1]) : undefined;
  if (/网络不可达|UnknownHost|Unable to resolve|Connection refused|ECONNREFUSED|ENETUNREACH/i.test(reason)) {
    return new StreamSourceError('原生取流失败（网络不可达）', 'native', status);
  }
  if (isHttpStatusError(reason)) {
    const clean = reason.replace(/（[^）]*）/g, '').trim();
    return new StreamSourceError(`原生取流失败（${clean}）`, 'native', status);
  }
  return new StreamSourceError(`原生取流失败（连接中断）— ${reason}`, 'native', status);
}

/** 取流失败的中文原因，供 SYSTEM LOG 使用。 */
export function describeStreamSourceError(err: unknown): string {
  if (err instanceof StreamSourceError) return err.message;
  return err instanceof Error ? err.message : String(err);
}
