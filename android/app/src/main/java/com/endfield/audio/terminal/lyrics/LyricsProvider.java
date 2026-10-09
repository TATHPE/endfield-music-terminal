package com.endfield.audio.terminal.lyrics;

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
     * @return the lyrics, or {@code null} when the song was not found or the lookup
     *         failed; implementations may throw {@link RuntimeException} on
     *         unexpected errors (the repository retries once, then moves on)
     */
    String fetch(String title, String artist);
}
