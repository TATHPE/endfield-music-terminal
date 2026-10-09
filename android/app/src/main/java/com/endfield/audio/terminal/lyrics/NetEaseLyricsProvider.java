package com.endfield.audio.terminal.lyrics;

import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;

/**
 * NetEase Cloud Music lyric source: search for the song id, then fetch its LRC.
 *
 * <p>Ported verbatim from {@code MediaScannerPlugin.neteaseLyric/neteaseSearch};
 * only the HTTP call moved to {@link LyricsHttp} and the checked
 * {@code IOException} was dropped (that method reports failures as {@code null}).
 */
public class NetEaseLyricsProvider implements LyricsProvider {

    /** NetEase endpoints answer 403 without the site as referer. */
    private static final String REFERER = "https://music.163.com/";

    @Override
    public String name() {
        return "net";
    }

    @Override
    public String fetch(String title, String artist) {
        if (title == null || title.isEmpty()) return null;
        // First try title + artist, then retry with the bare title — the artist
        // token often contains separators/remix tags that break the search.
        String lyric = search(title, artist);
        if (lyric == null) lyric = search(title, null);
        return lyric;
    }

    private String search(String title, String artist) {
        String query = (artist == null || artist.isEmpty()) ? title : title + " " + artist;
        String enc = encodeUtf8(query);
        String searchUrl = "https://music.163.com/api/search/get/web?csrf_token=&s=" + enc + "&type=1&limit=5";
        String searchJson = LyricsHttp.get(searchUrl, REFERER);
        // The shape of the search payload lives in LyricsParsing (unit-tested).
        long id = LyricsParsing.bestNetEaseId(searchJson, title);
        if (id <= 0) return null;
        String lyricUrl = "https://music.163.com/api/song/lyric?id=" + id + "&lv=-1&kv=-1&tv=-1";
        String lyricJson = LyricsHttp.get(lyricUrl, REFERER);
        String lyric = LyricsParsing.netEaseLyric(lyricJson);
        return (lyric != null && !lyric.trim().isEmpty()) ? lyric : null;
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
