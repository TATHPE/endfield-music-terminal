// EXPORTS: MseMp3Stream, MseStreamOptions
//
// Fetch + MediaSource playback for ICY / Shoutcast style MP3 radio streams.
//
// Why this exists: several Android WebView kernels reject an `ICY 200 OK`
// response (or an in-band `Icy-MetaData: 1` interleaved body) with
// MEDIA_ERR_SRC_NOT_SUPPORTED (code=4) when the URL is handed straight to
// `<audio src>`. Pulling the bytes with `fetch()` sends no `Icy-MetaData`
// header, so the server answers with a plain `HTTP/1.1 200` + pure MP3 body,
// which is then fed to `<audio>` through a MediaSource SourceBuffer instead of
// the platform decoder's own HTTP stack.
//
// A live stream never ends, so the SourceBuffer is managed as a sliding
// window: ~20s of look-ahead, with everything older than ~5s behind the
// playhead evicted periodically. The window math lives in src/lib/mse-window.ts.

import { evictionRange, shouldPauseAppend, type BufferedRange } from '@/lib/mse-window';

export interface MseStreamOptions {
  /** Receives a Chinese, end-user readable failure reason. */
  onError?: (msg: string) => void;
  /** Receives trace lines for the in-app SYSTEM LOG. */
  onLog?: (msg: string) => void;
}

/** Assumed codec when the server sends no usable Content-Type. */
const DEFAULT_MIME = 'audio/mpeg';
/** Mime candidates tried in order when the server's Content-Type is unusual. */
const MIME_FALLBACKS = ['audio/mpeg', 'audio/mp3'];
/** Stop appending once this much audio is buffered beyond the playhead. */
const AHEAD_SEC = 20;
/** Keep this much already-played audio around (seeking / lock-screen scrub). */
const KEEP_BEHIND_SEC = 5;
/** How often the sliding window tries to evict old data. */
const EVICTION_INTERVAL_MS = 5000;
/** Eviction retries with a wider window after QuotaExceededError. */
const MAX_EVICTION_RETRIES = 3;
/**
 * Once the playhead runs out of data the decoder stalls and `play()` resolves
 * without anything actually playing, so playback is (re)kicked slightly
 * *ahead* of the playhead, while the buffer still has something left.
 */
const PLAY_LOOKAHEAD_SEC = 0.3;
/** Give the MediaSource this long to fire `sourceopen`. */
const SOURCE_OPEN_TIMEOUT_MS = 8000;
/** Give playback this long to actually start before reporting failure. */
const START_TIMEOUT_MS = 15000;

/** `Icy-MetaData` is deliberately never sent — it is what mangles the body. */
const FETCH_INIT: RequestInit = {
  method: 'GET',
  cache: 'no-store',
  redirect: 'follow',
  credentials: 'omit',
  headers: { Accept: 'audio/mpeg, audio/*;q=0.9, */*;q=0.8' },
};

function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

function normalizeMime(raw: string | null, url: string): string {
  const value = String(raw || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (value.startsWith('audio/')) return value;
  // A useless Content-Type (application/octet-stream, text/plain, missing) is
  // overridden by the URL extension; without one there is nothing to go on, and
  // MP3 is the only codec this class claims to support.
  if (value && value !== 'application/octet-stream' && value !== 'text/plain') return '';
  return /\.mp3(?:[?#]|$)/i.test(url) ? DEFAULT_MIME : '';
}

/**
 * Streams an MP3 radio URL into an `<audio>` element through MediaSource.
 *
 * State machine: `idle` → `starting` (fetch + sourceopen + first append) →
 * `playing` (append pump running, sliding window active) → `stopped`.
 *
 * `start()` resolves once playback has actually begun, or rejects with a
 * Chinese reason; `stop()` tears everything down and may be called at any
 * point, including from inside `start()`.
 */
export class MseMp3Stream {
  /** True when this WebView has MSE and says it can play raw MP3 in it. */
  static isSupported(): boolean {
    if (typeof MediaSource === 'undefined') return false;
    try {
      return MediaSource.isTypeSupported(DEFAULT_MIME);
    } catch {
      return false;
    }
  }

  private readonly audio: HTMLAudioElement;
  private readonly url: string;
  private readonly onError?: (msg: string) => void;
  private readonly onLog?: (msg: string) => void;

  private readonly abort = new AbortController();
  private mediaSource: MediaSource | null = null;
  private sourceBuffer: SourceBuffer | null = null;
  private objectUrl: string | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  /** The one queued chunk waiting for the SourceBuffer to become free. */
  private pending: ArrayBuffer | null = null;
  private chunkInFlight = false;
  /** Skips a chunk when the buffer is already over the look-ahead window. */
  private skipChunk = false;

  private evictionTimer: number | undefined;
  private sourceOpenTimer: number | undefined;
  private watchdogTimer: number | undefined;

  private evictionBusy = false;
  private evictionRetries = 0;
  private quotaWarned = false;

  private playRequested = false;
  private playbackStarted = false;
  private stopped = false;

  private mime = DEFAULT_MIME;
  private resolveStart: (() => void) | null = null;
  private rejectStart: ((reason: Error) => void) | null = null;

  constructor(audio: HTMLAudioElement, url: string, opts?: MseStreamOptions) {
    this.audio = audio;
    this.url = url;
    this.onError = opts?.onError;
    this.onLog = opts?.onLog;
  }

  /** True once `stop()` has run — lets the caller ignore late media events. */
  isStopped(): boolean {
    return this.stopped;
  }

  async start(): Promise<void> {
    const attempt = new Promise<void>((resolve, reject) => {
      this.resolveStart = resolve;
      this.rejectStart = reject;
    });
    await this.setup();
    // `stop()` settles this promise too, so it can never hang.
    await attempt;
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;

    const reject = this.rejectStart;
    const resolve = this.resolveStart;
    this.rejectStart = null;
    this.resolveStart = null;
    reject?.(new Error('在线流播放已停止'));
    resolve?.();

    try {
      this.abort.abort();
    } catch {
      /* already aborted */
    }
    this.clearTimers();

    const reader = this.reader;
    this.reader = null;
    if (reader) void reader.cancel().catch(() => undefined);

    this.audio.removeEventListener('error', this.onAudioError);

    const buffer = this.sourceBuffer;
    this.sourceBuffer = null;
    if (buffer) {
      try {
        buffer.removeEventListener('updateend', this.onUpdateEnd);
        buffer.removeEventListener('error', this.onBufferError);
      } catch {
        /* listener bookkeeping only */
      }
    }
    this.pending = null;
    this.chunkInFlight = false;

    const media = this.mediaSource;
    this.mediaSource = null;
    if (media) {
      try {
        media.removeEventListener('sourceopen', this.onSourceOpen);
        media.removeEventListener('error', this.onSourceError);
        if (media.readyState === 'open') media.endOfStream();
      } catch {
        /* may already be closed */
      }
    }

    // The WebAudio graph (createMediaElementSource) keeps the element bound for
    // the page lifetime, so releasing the network stream is all that is needed:
    // the object URL and the element's src are cleared.
    try {
      this.audio.pause();
    } catch {
      /* not playing */
    }
    if (this.objectUrl) {
      try {
        this.audio.removeAttribute('src');
        this.audio.load();
      } catch {
        /* detached */
      }
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.log('MSE STOPPED');
  }

  private clearTimers(): void {
    if (this.sourceOpenTimer !== undefined) window.clearTimeout(this.sourceOpenTimer);
    if (this.watchdogTimer !== undefined) window.clearTimeout(this.watchdogTimer);
    if (this.evictionTimer !== undefined) window.clearInterval(this.evictionTimer);
    this.sourceOpenTimer = undefined;
    this.watchdogTimer = undefined;
    this.evictionTimer = undefined;
  }

  private log(message: string): void {
    this.onLog?.(message);
  }

  /** Terminal failure. The caller decides whether to fall back and then stop(). */
  private fail(message: string): void {
    if (this.stopped) return;
    const reject = this.rejectStart;
    this.resolveStart = null;
    this.rejectStart = null;
    this.log(`MSE FAIL — ${message}`);
    this.onError?.(message);
    reject?.(new Error(message));
  }

  private codeSuffix(): string {
    const code = this.audio.error?.code;
    return code === undefined ? '' : `（媒体 code=${code}）`;
  }

  /** Preflight + fetch + MediaSource wiring. */
  private async setup(): Promise<void> {
    const controller = new AbortController();
    const onOuterAbort = () => controller.abort();
    if (this.abort.signal.aborted) return;
    // AbortSignal.any() is missing on the WebView kernels this targets, so the
    // two signals are chained by hand.
    this.abort.signal.addEventListener('abort', onOuterAbort);

    try {
      if (/^http:\/\//i.test(this.url)) {
        // Requesting it would only produce an opaque net error, so report the
        // real cause up front.
        throw new Error('不支持 http 明文流（混合内容限制），请改用 https 地址');
      }
      if (!MseMp3Stream.isSupported()) {
        throw new Error('浏览器不支持 MSE 播放 MP3');
      }

      let response: Response;
      try {
        response = await fetch(this.url, { ...FETCH_INIT, signal: controller.signal });
      } catch (err) {
        if (this.stopped) return;
        throw new Error(`该电台流拉取失败（可能不支持跨域或网络不可达）— ${describe(err)}`);
      }
      if (this.stopped) return;
      if (!response.ok) {
        throw new Error(`该电台流返回错误状态 HTTP ${response.status} ${response.statusText}`.trim());
      }
      const body = response.body;
      if (!body) throw new Error('该电台流没有返回可读取的数据体');

      const rawMime = response.headers.get('content-type');
      this.mime =
        normalizeMime(rawMime, this.url) ||
        MIME_FALLBACKS.find((m) => MediaSource.isTypeSupported(m)) ||
        DEFAULT_MIME;
      this.log(
        `MSE OPEN — HTTP ${response.status} · type=${rawMime || 'unknown'} · mime=${this.mime}`,
      );

      const media = new MediaSource();
      this.mediaSource = media;
      this.objectUrl = URL.createObjectURL(media);
      media.addEventListener('sourceopen', this.onSourceOpen);
      media.addEventListener('error', this.onSourceError);
      this.sourceOpenTimer = window.setTimeout(() => {
        if (this.stopped || this.sourceBuffer) return;
        this.fail('MediaSource 未能在超时前就绪');
      }, SOURCE_OPEN_TIMEOUT_MS);
      this.watchdogTimer = window.setTimeout(() => {
        if (this.stopped || this.playbackStarted) return;
        this.fail('该电台流已开始拉取但迟迟无法播放（解码器可能不支持这个 MP3 流）');
      }, START_TIMEOUT_MS);

      // crossOrigin must be set before src: the element is wired into the
      // WebAudio analyser, so a blob: URL with a stale/absent crossOrigin is
      // treated as tainted and silenced.
      this.audio.crossOrigin = 'anonymous';
      this.audio.removeEventListener('error', this.onAudioError);
      this.audio.addEventListener('error', this.onAudioError);
      this.audio.src = this.objectUrl;
      try {
        this.audio.load();
      } catch {
        /* some kernels reject an explicit load() before the source attaches */
      }

      this.playRequested = true;
      if (this.stopped) return;
      this.reader = body.getReader();
      // Kick playback immediately; a rejected promise here is normal (no data
      // yet) and is retried from every `updateend` via maybeStartPlayback().
      void this.tryPlay();
    } catch (err) {
      if (this.stopped) return;
      this.fail(err instanceof Error ? err.message : String(err));
    } finally {
      this.abort.signal.removeEventListener('abort', onOuterAbort);
    }
  }

  private readonly onSourceOpen = () => {
    if (this.stopped || !this.mediaSource || this.sourceBuffer) return;
    if (this.sourceOpenTimer !== undefined) {
      window.clearTimeout(this.sourceOpenTimer);
      this.sourceOpenTimer = undefined;
    }
    try {
      const buffer = this.mediaSource.addSourceBuffer(this.mime);
      this.sourceBuffer = buffer;
      buffer.addEventListener('updateend', this.onUpdateEnd);
      buffer.addEventListener('error', this.onBufferError);
      this.log(`MSE SOURCEBUFFER — ${this.mime}`);
    } catch (err) {
      this.fail(`无法创建音频缓冲区（该 WebView 不支持 ${this.mime}）— ${describe(err)}`);
      return;
    }
    this.ensureEvictionTimer();
    void this.readLoop();
  };

  private readonly onSourceError = () => {
    if (this.stopped) return;
    this.fail('MediaSource 发生错误（该地址可能不是有效的 MP3 数据）');
  };

  private readonly onBufferError = () => {
    if (this.stopped) return;
    this.fail(`音频缓冲区错误${this.codeSuffix()}`);
  };

  private readonly onUpdateEnd = () => {
    // `updateend` follows both appendBuffer() and remove(): clear both latches
    // here so a failed/slow eviction can never wedge the append pump.
    this.chunkInFlight = false;
    this.evictionBusy = false;
    if (this.stopped) return;
    this.maybeStartPlayback();
    if (this.pending !== null) this.flush();
  };

  /** Read the fetched body and feed it to the SourceBuffer. */
  private async readLoop(): Promise<void> {
    const reader = this.reader;
    if (!reader) return;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (this.stopped) return;
        if (done) {
          this.log('MSE EOF — 在线流已结束');
          this.endStream();
          return;
        }
        if (!value || value.byteLength === 0) continue;
        if (shouldPauseAppend(this.readBuffered(), this.audio.currentTime, AHEAD_SEC)) {
          // Over the look-ahead window: drop the chunk so the mount depth stays
          // bounded and the listener stays close to live.
          this.skipChunk = true;
          continue;
        }
        await this.append(value);
      }
    } catch (err) {
      if (this.stopped) return;
      this.fail(`读取在线流数据失败（连接可能已中断）— ${describe(err)}`);
    }
  }

  private endStream(): void {
    const media = this.mediaSource;
    if (!media || media.readyState !== 'open') return;
    if (this.sourceBuffer?.updating) return;
    try {
      media.endOfStream();
    } catch {
      /* nothing to end */
    }
  }

  /** Snapshot of `audio.buffered` as plain numbers. */
  private readBuffered(): BufferedRange[] {
    const out: BufferedRange[] = [];
    try {
      const ranges = this.audio.buffered;
      for (let i = 0; i < ranges.length; i += 1) {
        out.push({ start: ranges.start(i), end: ranges.end(i) });
      }
    } catch {
      /* no metadata yet — an empty window is the right answer */
    }
    return out;
  }

  /**
   * Queue one chunk, then resolve. Ordering is preserved by the single
   * `pending` slot: `readLoop` awaits each chunk, so the reader is never read
   * again while a chunk is still queued (natural backpressure).
   */
  private append(chunk: Uint8Array): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.skipChunk) {
      this.skipChunk = false;
      return Promise.resolve();
    }
    const copy = chunk.buffer.slice(
      chunk.byteOffset,
      chunk.byteOffset + chunk.byteLength,
    ) as ArrayBuffer;
    this.pending = copy;
    this.flush();
    return Promise.resolve();
  }

  /** Hand the queued chunk to the SourceBuffer when it is free. */
  private flush(): void {
    if (this.stopped || this.pending === null || this.chunkInFlight) return;
    const buffer = this.sourceBuffer;
    if (!buffer || buffer.updating) return;
    const media = this.mediaSource;
    if (!media || media.readyState !== 'open') return;
    const data = this.pending;
    this.pending = null;
    this.chunkInFlight = true;
    try {
      buffer.appendBuffer(data);
      this.maybeStartPlayback();
    } catch (err) {
      this.chunkInFlight = false;
      this.handleAppendError(err);
    }
  }

  private handleAppendError(err: unknown): void {
    if (this.stopped) return;
    const name = err instanceof Error ? err.name : '';
    if (name === 'QuotaExceededError') {
      // Buffer full: evict harder and drop this chunk. Losing a slice of a live
      // stream is harmless, but killing playback is not.
      this.evictionRetries = 0;
      if (!this.quotaWarned) {
        this.quotaWarned = true;
        this.log('MSE QUOTA — 缓冲区已满，正在加大淘汰力度');
      }
      this.evict(KEEP_BEHIND_SEC * 2);
      return;
    }
    this.fail(`追加音频数据失败 — ${describe(err)}`);
  }

  private maybeStartPlayback(): void {
    if (this.stopped || this.playbackStarted || !this.playRequested) return;
    if (!this.bufferedAhead()) return;
    void this.tryPlay();
  }

  /** Seconds of contiguous audio buffered after the playhead (any gap-aware). */
  private bufferedAhead(): number {
    const current = this.audio.currentTime;
    let best = 0;
    for (const range of this.readBuffered()) {
      if (range.end <= current + PLAY_LOOKAHEAD_SEC) continue;
      best = Math.max(best, range.end - Math.max(range.start, current));
    }
    return best;
  }

  private async tryPlay(): Promise<void> {
    if (this.stopped || this.playbackStarted || !this.audio.src) return;
    try {
      await this.audio.play();
      if (this.stopped || this.playbackStarted) return;
      this.playbackStarted = true;
      if (this.watchdogTimer !== undefined) {
        window.clearTimeout(this.watchdogTimer);
        this.watchdogTimer = undefined;
      }
      const resolve = this.resolveStart;
      this.resolveStart = null;
      this.rejectStart = null;
      this.log('MSE PLAYING');
      resolve?.();
    } catch (err) {
      if (this.stopped || this.playbackStarted) return;
      const name = err instanceof Error ? err.name : 'UnknownError';
      // A newer load() interrupted this attempt — the caller knows about it.
      if (name === 'AbortError') return;
      if (name === 'NotAllowedError') {
        // Autoplay policy: the user starts playback from the transport; the
        // stream itself is fine, so this is not an error.
        this.log('MSE PLAY BLOCKED — NotAllowedError（等待用户操作）');
        return;
      }
      this.fail(`在线流播放被拒绝（${name}）`);
    }
  }

  private ensureEvictionTimer(): void {
    if (this.stopped || this.evictionTimer !== undefined) return;
    this.evictionTimer = window.setInterval(() => {
      this.evict();
    }, EVICTION_INTERVAL_MS);
  }

  /**
   * Drop the data far enough behind the playhead. `extraKeepBehind` lets the
   * quota path evict more aggressively than the regular 5s window.
   */
  private evict(extraKeepBehind = 0): void {
    if (this.stopped || this.evictionBusy) return;
    const buffer = this.sourceBuffer;
    if (!buffer || buffer.updating) return;
    const current = this.audio.currentTime;
    const ranges = this.readBuffered();
    // Widen the window first when the buffer is full, then fall back to the
    // standard window so a stale playhead can never block eviction entirely.
    const range =
      (extraKeepBehind > 0
        ? evictionRange(ranges, current, KEEP_BEHIND_SEC + extraKeepBehind)
        : null) ?? evictionRange(ranges, current, KEEP_BEHIND_SEC);
    if (!range) return;
    this.evictionBusy = true;
    try {
      buffer.remove(range.start, range.end);
      this.evictionRetries = 0;
    } catch (err) {
      this.evictionBusy = false;
      const name = err instanceof Error ? err.name : '';
      if (name === 'QuotaExceededError') {
        this.evictionRetries += 1;
        if (this.evictionRetries <= MAX_EVICTION_RETRIES) {
          this.log('MSE QUOTA — 淘汰被拒，下一次将使用更宽的区间');
        }
        return;
      }
      // A stale/invalid range must never take playback down.
      this.log(`MSE EVICT SKIPPED — ${describe(err)}`);
    }
  }

  /** An element-level decoder error means this stream cannot be played at all. */
  private readonly onAudioError = () => {
    if (this.stopped) return;
    this.fail(`在线流播放失败（媒体元素报错${this.codeSuffix()}）`);
  };
}
