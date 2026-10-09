package com.endfield.audio.terminal.lyrics;

import android.util.Base64;

import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * Tencent Music (QQ) lyric fallback: search by songmid, fetch the LRC.
 *
 * <p>Ported verbatim from {@code MediaScannerPlugin.qqLyric}; only the HTTP call
 * moved to {@link LyricsHttp} and the checked {@code IOException} was dropped
 * (that method reports failures as {@code null}). The base64 decoding keeps using
 * the Android API, which is why this class is not JVM-testable.
 */
public class QQLyricsProvider implements LyricsProvider {

    /** QQ endpoints answer with a cross-origin guard unless y.qq.com is the referer. */
    private static final String REFERER = "https://y.qq.com/";

    @Override
    public String name() {
        return "qq";
    }

    @Override
    public String fetch(String title, String artist) {
        if (title == null || title.isEmpty()) return null;
        String query = (artist == null || artist.isEmpty()) ? title : title + " " + artist;
        String enc = encodeUtf8(query);
        String searchUrl = "https://c.y.qq.com/soso/fcgi-bin/client_search_cp?format=json&p=1&n=5&w=" + enc;
        String searchJson = LyricsHttp.get(searchUrl, REFERER);
        String songmid = LyricsParsing.bestQQSongMid(searchJson, title);
        if (songmid == null || songmid.isEmpty()) return null;
        String lyricUrl = "https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?format=json&songmid=" + songmid;
        String lyricJson = LyricsHttp.get(lyricUrl, REFERER);
        String raw = LyricsParsing.qqLyricRaw(lyricJson);
        if (raw != null && !raw.isEmpty()) {
            // Usually base64-encoded LRC; some builds return plain text.
            try {
                byte[] dec = Base64.decode(raw, Base64.DEFAULT);
                String lrc = new String(dec, StandardCharsets.UTF_8);
                if (!lrc.trim().isEmpty()) return lrc;
            } catch (IllegalArgumentException ignored) {
                if (!raw.trim().isEmpty()) return raw;
            }
        }
        return null;
    }

    /** UTF-8 exists on every JVM/Android build; the checked exception is a formality. */
    private static String encodeUtf8(String raw) {
        try {
            return URLEncoder.encode(raw, "UTF-8");
        } catch (UnsupportedEncodingException e) {
            throw new IllegalStateException("UTF-8 unavailable", e);
        }
    }
}
