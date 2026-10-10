package com.endfield.audio.terminal;

import android.os.Handler;
import android.os.Looper;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;

/**
 * StreamFetcher — 原生取流通道（绕过 WebView 的 HTTP 栈）。
 *
 * 为什么需要它：页面 origin 是 https://localhost，浏览器 fetch 必然带上
 * Origin / Sec-Fetch-*，SomaFM 等电台的热链保护据此回 403。原生侧用
 * HttpURLConnection 自己发请求，只带 UA / Accept（不带 Origin / Referer），
 * 服务端就放行；字节通过 chunk 事件推给 JS，仍然交给现有的 MSE 播放器。
 *
 * 协议要点：
 *  - ICY：响应行可能是 `ICY 200 OK`（HttpURLConnection 会拒绝解析），此时回退到
 *    Socket 手工发请求并自己解析响应头；响应头带 icy-metaint 时按 metaint 跳过
 *    元数据块（元数据绝不能当音频喂给 MSE）。
 *  - 背压：JS 每消费一批就 ack({id,bytes})，未确认字节超过高水位就 wait()，
 *    收到 ack 后唤醒。没有这一步，弱网 + 快源会把内存吃爆。
 *
 * 只用 JDK / Android 标准库，不引入任何新依赖。
 */
@CapacitorPlugin(name = "StreamFetcher")
public class StreamFetcherPlugin extends Plugin {

    /** 桌面 Chrome UA：电台的热链保护普遍放行桌面浏览器，且它明确不是 WebView。 */
    private static final String UA =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    /** 连接 / 读取超时（读取超时同时充当"流卡住"的看门狗）。 */
    private static final int TIMEOUT_MS = 15000;

    /** 攒够这么多字节就推一批（128kbps 下约 1s 音频）。 */
    private static final int FLUSH_BYTES = 16 * 1024;
    /** 或者攒够这么久也推一批，避免低码率流起播迟滞。 */
    private static final long FLUSH_INTERVAL_MS = 500L;

    /** 未确认字节超过这个量就暂停读取（背压高水位）。 */
    private static final long HIGH_WATER_BYTES = 256 * 1024;
    /** 等 ack 最多等这么久：超过就按无背压模式继续，宁可多占内存也不能卡死。 */
    private static final long ACK_WAIT_TIMEOUT_MS = 30000L;
    /** 单批上限，纯防御（正常批次是 FLUSH_BYTES 量级）。 */
    private static final int MAX_CHUNK_BYTES = 4 * 1024 * 1024;

    /** 一条取流会话的全部可变状态。 */
    private static final class StreamState {
        final Object lock = new Object();
        final String url;
        final String id;
        /** 已推给 JS 但还没 ack 的字节数（ack 之后允许为负）。 */
        long pending;
        volatile boolean noAckWarned;
        volatile boolean stopped;
        volatile boolean failed;
        volatile int metaInt;
        volatile InputStream in;
        volatile Thread thread;
        /** 安卓的 HttpURLConnection 既不是 Closeable 也不是 AutoCloseable，只能 disconnect()。 */
        volatile HttpURLConnection conn;
        volatile Socket socket;

        StreamState(String url, String id) {
            this.url = url;
            this.id = id;
        }
    }

    private final Map<String, StreamState> streams = new HashMap<>();
    private final Handler main = new Handler(Looper.getMainLooper());

    // --- 对 JS 暴露的方法 -----------------------------------------------------

    /**
     * start({ url, id })：立刻 resolve，之后字节通过 chunk 事件流式推送。
     * 失败走 failed 事件（连接阶段就已失败也一样，这样 JS 侧只有一条错误路径）。
     */
    @PluginMethod
    public void start(PluginCall call) {
        String url = call.getString("url");
        String id = call.getString("id");
        if (url == null || id == null) {
            call.reject("缺少参数：url / id");
            return;
        }
        String scheme;
        try {
            scheme = new URL(url).getProtocol();
        } catch (Exception e) {
            call.reject("流地址不合法，无法解析");
            return;
        }
        boolean plainHttp = "http".equalsIgnoreCase(scheme);
        boolean secure = "https".equalsIgnoreCase(scheme);
        if (!plainHttp && !secure) {
            call.reject("只支持 http / https 流地址");
            return;
        }
        if (plainHttp) {
            // 页面是 https://localhost，明文流会被混合内容策略拦下，连请求都不必发。
            call.reject("不支持 http 明文流（混合内容限制），请改用 https 地址");
            return;
        }

        // 同一个 id 重开：先终结旧会话，避免两条线程抢同一个 id。
        stopState(id, false);

        final StreamState state = new StreamState(url, id);
        synchronized (streams) {
            streams.put(id, state);
        }
        Thread thread = new Thread(new Runnable() {
            @Override
            public void run() {
                runStream(state);
            }
        }, "stream-fetcher-" + id);
        state.thread = thread;
        thread.start();
        call.resolve();
    }

    /**
     * ack({ id, bytes })：JS 消费回执。幂等，未知 id 当无事发生。
     */
    @PluginMethod
    public void ack(PluginCall call) {
        String id = call.getString("id");
        if (id == null) {
            call.resolve();
            return;
        }
        Long boxed = call.getLong("bytes");
        long bytes = boxed == null ? 0L : boxed;
        StreamState state;
        synchronized (streams) {
            state = streams.get(id);
        }
        if (state != null) {
            synchronized (state.lock) {
                state.pending -= bytes;
                state.lock.notifyAll();
            }
        }
        call.resolve();
    }

    /** stop({ id })：关闭连接、唤醒线程、清状态。幂等。 */
    @PluginMethod
    public void stop(PluginCall call) {
        String id = call.getString("id");
        if (id == null) {
            call.resolve();
            return;
        }
        stopState(id, true);
        call.resolve();
    }

    // --- 会话生命周期 ---------------------------------------------------------

    private void stopState(String id, boolean remove) {
        StreamState state;
        synchronized (streams) {
            state = remove ? streams.remove(id) : streams.get(id);
        }
        if (state == null) return;
        state.stopped = true;
        synchronized (state.lock) {
            state.lock.notifyAll();
        }
        // 关连接会让阻塞中的 read() 立刻抛 IOException，线程随即退出。
        disconnectQuietly(state.conn);
        closeQuietly(state.socket);
    }

    private void removeIfCurrent(StreamState state) {
        synchronized (streams) {
            if (streams.get(state.id) == state) streams.remove(state.id);
        }
    }

    private static void closeQuietly(AutoCloseable target) {
        if (target == null) return;
        try {
            target.close();
        } catch (Exception ignored) {
            // 已关闭 / 对端已断开，无需处理。
        }
    }

    /** 关连接：disconnect() 会同时中断阻塞中的读取（抛 IOException 让线程退出）。 */
    private static void disconnectQuietly(HttpURLConnection conn) {
        if (conn == null) return;
        try {
            conn.disconnect();
        } catch (Exception ignored) {
            // 已经断开，无需处理。
        }
    }

    // --- 读取线程 -------------------------------------------------------------

    private void runStream(StreamState state) {
        try {
            open(state);
            pump(state);
            if (!state.stopped && !state.failed) {
                notifyEvent("ended", state, null);
            }
        } catch (Throwable t) {
            if (!state.stopped && !state.failed) {
                state.failed = true;
                notifyEvent("failed", state, describe(t));
            }
        } finally {
            state.stopped = true;
            disconnectQuietly(state.conn);
            closeQuietly(state.socket);
            state.in = null;
            removeIfCurrent(state);
        }
    }

    /** 建立连接：先 HttpURLConnection，ICY 状态行不被接受时退回 Socket。 */
    private void open(StreamState state) throws IOException {
        try {
            openWithUrlConnection(state);
        } catch (IOException first) {
            if (state.stopped) throw first;
            // HttpURLConnection 见到 `ICY 200 OK` 会直接抛 IOException；改用原生
            // Socket 手工发请求 + 自己解析响应头，body 走同一套读取路径。
            openWithSocket(state, first);
        }
    }

    private void openWithUrlConnection(StreamState state) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(state.url).openConnection();
        state.conn = conn;
        conn.setRequestMethod("GET");
        conn.setInstanceFollowRedirects(true);
        conn.setConnectTimeout(TIMEOUT_MS);
        conn.setReadTimeout(TIMEOUT_MS);
        conn.setUseCaches(false);
        // 只带 UA 与 Accept：不带 Origin / Referer / Sec-Fetch-*，这才是绕过热链保护的关键。
        conn.setRequestProperty("User-Agent", UA);
        conn.setRequestProperty("Accept", "audio/mpeg, audio/*;q=0.9, */*;q=0.8");
        conn.setRequestProperty("Icy-MetaData", "0");
        conn.setRequestProperty("Connection", "keep-alive");

        int status = conn.getResponseCode();
        if (status < 200 || status > 299) {
            String reason = conn.getResponseMessage();
            throw new IOException("HTTP " + status + (reason == null ? "" : " " + reason.trim()));
        }
        state.metaInt = icyMetaInt(conn.getHeaderField("icy-metaint"));
        InputStream in = conn.getInputStream();
        if (in == null) throw new IOException("响应没有可读取的数据体");
        state.in = in;
        String type = conn.getContentType();
        if (type != null && !type.trim().isEmpty()) notifyType(state, type);
    }

    private void openWithSocket(StreamState state, IOException cause) throws IOException {
        URL url = new URL(state.url);
        String host = url.getHost();
        int port = url.getPort() > 0 ? url.getPort() : 443;
        if (!"https".equalsIgnoreCase(url.getProtocol())) throw cause;

        Socket socket = new Socket();
        state.socket = socket;
        socket.connect(new InetSocketAddress(host, port), TIMEOUT_MS);
        socket.setSoTimeout(TIMEOUT_MS);
        socket.setKeepAlive(true);
        OutputStream out = socket.getOutputStream();
        String path = url.getFile();
        if (path == null || path.isEmpty()) path = "/";
        StringBuilder req = new StringBuilder();
        req.append("GET ").append(path).append(" HTTP/1.1\r\n")
            .append("Host: ").append(host).append("\r\n")
            .append("User-Agent: ").append(UA).append("\r\n")
            .append("Accept: audio/mpeg, audio/*;q=0.9, */*;q=0.8\r\n")
            .append("Icy-MetaData: 0\r\n")
            .append("Connection: close\r\n\r\n");
        out.write(req.toString().getBytes(StandardCharsets.ISO_8859_1));
        out.flush();

        InputStream raw = socket.getInputStream();
        String statusLine = readAsciiLine(raw);
        while (statusLine != null && statusLine.isEmpty()) statusLine = readAsciiLine(raw);
        if (statusLine == null) throw new IOException("连接被对端关闭（没有响应）");
        String[] parts = statusLine.split(" ");
        if (parts.length < 2) throw new IOException("响应状态行无法解析：" + statusLine);
        int status;
        try {
            status = Integer.parseInt(parts[1].trim());
        } catch (NumberFormatException e) {
            throw new IOException("响应状态行无法解析：" + statusLine);
        }
        // 状态行的协议名可能是 ICY / HTTP / 别的，只认状态码本身。
        if (status < 200 || status > 299) {
            throw new IOException("HTTP " + status + "（取流被拒绝）");
        }
        String contentType = null;
        for (int i = 0; i < 64; i++) {
            String line = readAsciiLine(raw);
            if (line == null || line.isEmpty()) break;
            int colon = line.indexOf(':');
            if (colon <= 0) continue;
            String name = line.substring(0, colon).trim().toLowerCase();
            String value = line.substring(colon + 1).trim();
            if ("icy-metaint".equals(name) || "ice-metaint".equals(name)) {
                state.metaInt = icyMetaInt(value);
            } else if ("content-type".equals(name)) {
                contentType = value;
            }
        }
        state.in = raw;
        if (contentType != null && !contentType.trim().isEmpty()) notifyType(state, contentType);
    }

    /** 按 metaint 切分音频与元数据，攒批推送，批间做背压检查。 */
    private void pump(StreamState state) throws IOException {
        byte[] buf = new byte[8 * 1024];
        ByteArrayOutputStream acc = new ByteArrayOutputStream(FLUSH_BYTES);
        long lastPush = System.currentTimeMillis();
        int metaLeft = 0;
        int metaint = state.metaInt;

        while (!state.stopped) {
            if (metaint > 0) {
                if (metaLeft > 0) {
                    // 元数据块：跳过，绝不当音频喂给 MSE。
                    metaLeft -= readBytes(state.in, buf, Math.min(buf.length, metaLeft));
                    continue;
                }
                if (acc.size() >= metaint) {
                    push(state, acc);
                    lastPush = System.currentTimeMillis();
                    continue;
                }
                int n = readBytes(state.in, buf, Math.min(buf.length, metaint - acc.size()));
                if (n <= 0) {
                    push(state, acc);
                    return; // 流自然结束
                }
                acc.write(buf, 0, n);
                if (acc.size() >= metaint) {
                    // ICY 规定：紧跟 metaint 个音频字节之后是 1 字节长度（单位 16 字节）。
                    int lengthByte = state.in.read();
                    if (lengthByte < 0) {
                        push(state, acc);
                        return;
                    }
                    metaLeft = lengthByte * 16;
                }
            } else {
                int n = readBytes(state.in, buf, buf.length);
                if (n <= 0) {
                    push(state, acc);
                    return; // 流自然结束
                }
                acc.write(buf, 0, n);
            }

            if (state.stopped) return;
            if (acc.size() >= FLUSH_BYTES
                || (acc.size() > 0 && System.currentTimeMillis() - lastPush >= FLUSH_INTERVAL_MS)) {
                push(state, acc);
                lastPush = System.currentTimeMillis();
            }
        }
    }

    /** 推送一批并施加背压。 */
    private void push(StreamState state, ByteArrayOutputStream acc) {
        int size = acc.size();
        if (size <= 0) return;
        byte[] chunk = acc.toByteArray();
        acc.reset();
        if (chunk.length > MAX_CHUNK_BYTES) chunk = Arrays.copyOf(chunk, MAX_CHUNK_BYTES);
        if (state.stopped || chunk.length == 0) return;

        state.pending += chunk.length;
        notifyChunk(state, chunk);

        if (state.pending <= HIGH_WATER_BYTES) return;
        // 背压：等 JS 的 ack。ack 可能比这里更早到（pending 已经降下来），
        // 所以必须重新判断条件；stop() 也会 notifyAll 把线程叫醒。
        long deadline = System.currentTimeMillis() + ACK_WAIT_TIMEOUT_MS;
        synchronized (state.lock) {
            while (!state.stopped && state.pending > HIGH_WATER_BYTES) {
                long left = deadline - System.currentTimeMillis();
                if (left <= 0) {
                    if (!state.noAckWarned) {
                        state.noAckWarned = true;
                        // JS 没接上 ack（理论上不该发生）：解除背压继续读，
                        // 宁可多占内存也不能把播放线程卡死。
                        Logger.warn(Logger.tags("StreamFetcher"),
                            "no ack after " + state.pending + " pending bytes — backpressure disabled");
                    }
                    state.pending = 0;
                    return;
                }
                try {
                    state.lock.wait(Math.min(left, 1000L));
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    return;
                }
            }
        }
    }

    // --- 底层读取助手 ---------------------------------------------------------

    /** 读满 len 个字节或到流尾，返回实际读到的字节数。 */
    private static int readBytes(InputStream in, byte[] buf, int len) throws IOException {
        int total = 0;
        while (total < len) {
            int n = in.read(buf, total, len - total);
            if (n < 0) break;
            total += n;
        }
        return total;
    }

    private static int icyMetaInt(String raw) {
        if (raw == null) return 0;
        try {
            int value = Integer.parseInt(raw.trim());
            return value > 0 ? value : 0;
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    /** 读一行（CRLF/LF 结束，ISO-8859-1 解码）；流尾且无内容时返回 null。 */
    private static String readAsciiLine(InputStream in) throws IOException {
        ByteArrayOutputStream line = new ByteArrayOutputStream(128);
        int b;
        while ((b = in.read()) >= 0) {
            if (b == '\n') break;
            if (b != '\r') line.write(b);
            if (line.size() > 8192) break;
        }
        if (b < 0 && line.size() == 0) return null;
        return new String(line.toByteArray(), StandardCharsets.ISO_8859_1);
    }

    // --- 事件派发 -------------------------------------------------------------

    /**
     * 事件必须在主线程派发：Bridge 的 JS 注入走 WebView，只应在 UI 线程调用。
     * 同一会话内统一 post 到主线程 Handler，顺带保证 chunk 的顺序。
     */
    private void post(final Runnable action) {
        main.post(new Runnable() {
            @Override
            public void run() {
                try {
                    action.run();
                } catch (Exception ignored) {
                    // WebView 已销毁等情况：丢弃这条事件即可。
                }
            }
        });
    }

    private void notifyChunk(final StreamState state, final byte[] chunk) {
        final String base64 = Base64.encodeToString(chunk, Base64.NO_WRAP);
        final int size = chunk.length;
        post(new Runnable() {
            @Override
            public void run() {
                if (state.stopped) return;
                JSObject data = new JSObject();
                data.put("id", state.id);
                data.put("data", base64);
                data.put("bytes", size);
                notifyListeners("chunk", data);
            }
        });
    }

    private void notifyType(final StreamState state, final String contentType) {
        final String type = contentType.trim();
        post(new Runnable() {
            @Override
            public void run() {
                if (state.stopped) return;
                JSObject data = new JSObject();
                data.put("id", state.id);
                data.put("type", type);
                notifyListeners("type", data);
            }
        });
    }

    private void notifyEvent(final String event, final StreamState state, final String message) {
        post(new Runnable() {
            @Override
            public void run() {
                if (state.stopped) return;
                JSObject data = new JSObject();
                data.put("id", state.id);
                if (message != null) data.put("message", message);
                notifyListeners(event, data);
            }
        });
    }

    private static String describe(Throwable t) {
        String message = t.getMessage();
        if (message == null || message.trim().isEmpty()) {
            return t.getClass().getSimpleName();
        }
        return message.trim();
    }
}
