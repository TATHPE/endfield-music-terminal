package com.endfield.audio.terminal.lyrics;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * The single synchronous HTTP GET used by the online lyric providers.
 *
 * <p>Moved out of the plugin so every provider shares the same transport
 * settings: 15s connect/read timeouts (older builds had none and could hang the
 * background pool on a dead socket), a browser-ish UA (NetEase / QQ refuse some
 * bare clients), and the {@code Accept} header the JSON endpoints expect.
 *
 * <p>Errors are deliberately non-throwing: a non-200 response or any network
 * problem simply yields {@code null}, so callers treat "unreachable" the same
 * way as "no match" and can fall through to the next provider.
 */
public final class LyricsHttp {

    private static final String UA =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

    /** Connect + read timeout, in milliseconds. */
    private static final int TIMEOUT_MS = 15000;

    private LyricsHttp() {
    }

    /**
     * GET {@code url} and decode the body as UTF-8.
     *
     * @param url     absolute http(s) URL
     * @param referer value for the {@code Referer} header; omitted when {@code null}
     * @return the response body, or {@code null} on a non-200 status or any network
     *         / protocol / decoding error
     */
    public static String get(String url, String referer) {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setConnectTimeout(TIMEOUT_MS);
            conn.setReadTimeout(TIMEOUT_MS);
            conn.setRequestMethod("GET");
            conn.setRequestProperty("User-Agent", UA);
            if (referer != null) conn.setRequestProperty("Referer", referer);
            conn.setRequestProperty("Accept", "application/json, text/plain, */*");
            int code = conn.getResponseCode();
            if (code != 200) return null;
            StringBuilder sb = new StringBuilder();
            try (BufferedReader br = new BufferedReader(
                    new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = br.readLine()) != null) sb.append(line);
            }
            return sb.toString();
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }
}
