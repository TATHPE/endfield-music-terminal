package com.endfield.audio.terminal.lyrics;

import java.io.IOException;
import java.net.URLEncoder;

/**
 * NetEase Cloud Music lyric source: search for the song id, then fetch its LRC.
 *
 * <p>Ported verbatim from {@code MediaScannerPlugin.neteaseLyric/neteaseSearch};
 * only the HTTP call moved to {@link LyricsHttp}, which keeps the original
 * contract: a transport failure is an {@link IOException} ("fetch failed"), a
 * non-200 answer or an unmatchable song is {@code null} ("no match").
 */
public class NetEaseLyricsProvider implements LyricsProvider {

    /** NetEase endpoints answer 403 without the site as referer. */
    private static final String REFERER = "https://music.163.com/";

    @Override
    public String name() {
        return "net";
    }

    @Override
    public String fetch(String title, String artist) throws IOException {
        if (title == null || title.isEmpty()) return null;
        // First try title + artist, then retry with the bare title — the artist
        // token often contains separators/remix tags that break the search.
        String lyric = search(title, artist);
        if (lyric == null) lyric = search(title, null);
        return lyric;
    }

    private String search(String title, String artist) throws IOException {
        String query = (artist == null || artist.isEmpty()) ? title : title + " " + artist;
        String enc = URLEncoder.encode(query, "UTF-8");
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
}
