package com.endfield.audio.terminal.lyrics;

import java.io.IOException;

/**
 * One online lyric source (NetEase, QQ Music, ...).
 *
 * <p>Implementations do the "search then download the LRC" dance for a single
 * service and hand back raw LRC text; ordering, retrying and fallback live in
 * {@link LyricsRepository}.
 */
public interface LyricsProvider {

    /** Short source tag, e.g. {@code net} / {@code qq}. Used for logging and reporting. */
    String name();

    /**
     * Look the song up and return its LRC text.
     *
     * @return the lyrics, or {@code null} when the service answered but the song
     *         could not be matched or carried no lyric ("no match")
     * @throws IOException when the lookup could not be completed at all (offline,
     *                     DNS/timeout/TLS/socket errors) — the repository retries
     *                     once, and when no source ever completes the caller
     *                     reports "fetch failed" rather than "not found"
     */
    String fetch(String title, String artist) throws IOException;
}
