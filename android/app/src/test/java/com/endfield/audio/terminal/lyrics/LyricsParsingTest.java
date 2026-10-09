package com.endfield.audio.terminal.lyrics;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * Pins the response shapes of the online lyric sources. If NetEase or QQ
 * changes their payload, these tests fail first — and only
 * {@link LyricsParsing} has to be patched.
 */
public class LyricsParsingTest {

    // Note: cleanTitle() strips bracket suffixes, so a "(Live)" hit ties with the
    // plain title and the first best hit wins — keep the fixtures unambiguous.
    private static final String NETEASE_SEARCH = "{"
            + "\"result\":{\"songs\":["
            + "{\"id\":111,\"name\":\"Something Else\"},"
            + "{\"id\":222,\"name\":\"New Frontier\"}"
            + "]}}";

    private static final String NETEASE_LYRIC = "{"
            + "\"lrc\":{\"lyric\":\"[00:01.00]A new horizon shall be revealed\"},"
            + "\"tlyric\":{\"lyric\":\"\"}}";

    private static final String QQ_SEARCH = "{"
            + "\"data\":{\"song\":{\"list\":["
            + "{\"songmid\":\"aaa\",\"songname\":\"Something Else\"},"
            + "{\"songmid\":\"bbb\",\"songname\":\"New Frontier\"}"
            + "]}}}";

    private static final String QQ_LYRIC = "{\"lyric\":\"WzAwOjAxLjAwXUJvcm4gb2YgYXNo\"}";

    @Test
    public void cleanTitleStripsTrackNumbersAndBrackets() {
        assertEquals("new frontier", LyricsParsing.cleanTitle("01. New Frontier"));
        assertEquals("new frontier", LyricsParsing.cleanTitle("New Frontier (Live)"));
        assertEquals("new frontier", LyricsParsing.cleanTitle("  07 - New   Frontier  "));
        assertEquals("", LyricsParsing.cleanTitle(null));
    }

    @Test
    public void titleScorePrefersExactMatches() {
        assertEquals(1.0, LyricsParsing.titleScore("abc", "abc"), 0.0001);
        assertTrue(LyricsParsing.titleScore("abc", "abcdef") >= 0.8);
        assertEquals(0.0, LyricsParsing.titleScore("", "abc"), 0.0001);
    }

    @Test
    public void netEaseSearchPicksTheBestTitleMatch() {
        // The first hit is a wrong song, the second one matches the title.
        assertEquals(222L, LyricsParsing.bestNetEaseId(NETEASE_SEARCH, "New Frontier"));
    }

    @Test
    public void netEaseSearchFallsBackToTheFirstHit() {
        assertEquals(111L, LyricsParsing.bestNetEaseId(NETEASE_SEARCH, ""));
    }

    @Test
    public void netEaseSearchSurvivesGarbage() {
        assertEquals(-1L, LyricsParsing.bestNetEaseId(null, "x"));
        assertEquals(-1L, LyricsParsing.bestNetEaseId("not json", "x"));
        assertEquals(-1L, LyricsParsing.bestNetEaseId("{}", "x"));
    }

    @Test
    public void netEaseLyricReadsTheLrcField() {
        assertEquals("[00:01.00]A new horizon shall be revealed", LyricsParsing.netEaseLyric(NETEASE_LYRIC));
        assertNull(LyricsParsing.netEaseLyric("{\"lrc\":{\"lyric\":\"\"}}"));
        assertNull(LyricsParsing.netEaseLyric("not json"));
    }

    @Test
    public void qqSearchPicksTheBestTitleMatch() {
        assertEquals("bbb", LyricsParsing.bestQQSongMid(QQ_SEARCH, "New Frontier"));
    }

    @Test
    public void qqLyricReturnsTheRawField() {
        assertEquals("WzAwOjAxLjAwXUJvcm4gb2YgYXNo", LyricsParsing.qqLyricRaw(QQ_LYRIC));
        assertNull(LyricsParsing.qqLyricRaw("{\"lyric\":\"\"}"));
        assertNull(LyricsParsing.qqLyricRaw(null));
    }
}
