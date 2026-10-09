package com.endfield.audio.terminal.lyrics;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Pure parsing helpers for the online lyric sources.
 *
 * <p>Everything in here is free of Android APIs so it can be exercised by plain
 * JVM unit tests ({@code src/test/java/.../LyricsParsingTest.java}). The HTTP
 * calls and the Android-only base64 decoding stay in the plugin / providers —
 * when NetEase or QQ changes their response shape, only this file should need
 * patching, and the tests below pin the expected shape.
 */
public final class LyricsParsing {

    private LyricsParsing() {
    }

    /** Normalize a title for matching: strip track numbers, brackets and extension noise. */
    public static String cleanTitle(String raw) {
        if (raw == null) return "";
        String t = raw.trim();
        // strip leading track numbers like "01." / "01 -" / "01、"
        t = t.replaceAll("^\\d{1,3}[.\\-、\\s]+", "");
        // strip bracketed/parenthesized annotations at the end (remix, feat, live...)
        t = t.replaceAll("\\s*[(\\[].*?[)\\]].*$", "");
        // collapse whitespace
        t = t.replaceAll("\\s+", " ").trim();
        return t.toLowerCase();
    }

    /** Simple title similarity in [0,1]: exact=1, containment=0.8+, else char-overlap ratio. */
    public static double titleScore(String a, String b) {
        if (a.isEmpty() || b.isEmpty()) return 0;
        if (a.equals(b)) return 1;
        if (a.contains(b) || b.contains(a)) return 0.8;
        int common = 0;
        for (int i = 0; i < a.length() && i < b.length(); i++) {
            if (a.charAt(i) == b.charAt(i)) common++;
        }
        return (double) common / Math.max(a.length(), b.length());
    }

    /**
     * Pick the song id from a NetEase search response, preferring the hit whose
     * title matches best (the first result is often a wrong album or remix).
     *
     * @return the id, or -1 when the payload carries no usable song
     */
    public static long bestNetEaseId(String searchJson, String title) {
        if (searchJson == null || searchJson.isEmpty()) return -1;
        try {
            JSONObject root = new JSONObject(searchJson);
            JSONObject result = root.optJSONObject("result");
            if (result == null) return -1;
            JSONArray songs = result.optJSONArray("songs");
            if (songs == null || songs.length() == 0) return -1;
            String cleanTitle = cleanTitle(title);
            long id = -1;
            double best = -1;
            for (int i = 0; i < songs.length(); i++) {
                JSONObject s = songs.getJSONObject(i);
                double score = titleScore(cleanTitle, cleanTitle(s.optString("name", "")));
                if (score > best) {
                    best = score;
                    id = s.optLong("id", -1);
                }
            }
            if (id <= 0) id = songs.getJSONObject(0).optLong("id", -1);
            return id;
        } catch (JSONException ignored) {
            return -1;
        }
    }

    /** Extract the LRC text from a NetEase {@code /api/song/lyric} response. */
    public static String netEaseLyric(String lyricJson) {
        if (lyricJson == null || lyricJson.isEmpty()) return null;
        try {
            JSONObject lrc = new JSONObject(lyricJson).optJSONObject("lrc");
            if (lrc == null) return null;
            String lyric = lrc.optString("lyric", "");
            return lyric.isEmpty() ? null : lyric;
        } catch (JSONException ignored) {
            return null;
        }
    }

    /** Pick the {@code songmid} from a QQ Music search response. */
    public static String bestQQSongMid(String searchJson, String title) {
        if (searchJson == null || searchJson.isEmpty()) return null;
        try {
            JSONObject root = new JSONObject(searchJson);
            JSONObject data = root.optJSONObject("data");
            if (data == null) return null;
            JSONObject song = data.optJSONObject("song");
            if (song == null) return null;
            JSONArray list = song.optJSONArray("list");
            if (list == null || list.length() == 0) return null;
            String cleanTitle = cleanTitle(title);
            String songmid = null;
            double best = -1;
            for (int i = 0; i < list.length(); i++) {
                JSONObject s = list.getJSONObject(i);
                double score = titleScore(cleanTitle, cleanTitle(s.optString("songname", "")));
                if (score > best) {
                    best = score;
                    songmid = s.optString("songmid", "");
                }
            }
            if (songmid == null || songmid.isEmpty()) {
                songmid = list.getJSONObject(0).optString("songmid", "");
            }
            return songmid == null || songmid.isEmpty() ? null : songmid;
        } catch (JSONException ignored) {
            return null;
        }
    }

    /**
     * Raw {@code lyric} field of a QQ Music lyric response. It is usually
     * base64-encoded LRC, but some builds return plain text, so the caller
     * decides (the decoding itself uses the Android base64 API).
     */
    public static String qqLyricRaw(String lyricJson) {
        if (lyricJson == null || lyricJson.isEmpty()) return null;
        try {
            String lyric = new JSONObject(lyricJson).optString("lyric", "");
            return lyric.isEmpty() ? null : lyric;
        } catch (JSONException ignored) {
            return null;
        }
    }
}
