package com.endfield.audio.terminal.lyrics;

import android.util.Log;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * Ordered front-end over the online lyric providers.
 *
 * <p>Walks the providers in order (NetEase, then QQ Music) and returns the first
 * usable LRC. Each provider gets one retry, so a single flaky request or a
 * transient empty payload does not immediately drop the whole source. A provider
 * that throws is logged and skipped — one broken service never breaks the chain.
 *
 * <p>This class is the only place that knows the source order; the plugin just
 * calls {@link #fetch(String, String)}. Logging goes to {@code Log} with the
 * {@code EndfieldLyrics} tag (the same tag the other native lyric paths use).
 */
public class LyricsRepository {

    private static final String TAG = "EndfieldLyrics";

    /** Default source order: NetEase first, QQ Music as the fallback. */
    private static final List<LyricsProvider> DEFAULT_PROVIDERS =
        Collections.unmodifiableList(Arrays.<LyricsProvider>asList(
            new NetEaseLyricsProvider(),
            new QQLyricsProvider()));

    /** One initial attempt plus a single retry. */
    private static final int ATTEMPTS_PER_PROVIDER = 2;

    private final List<LyricsProvider> providers;

    /** Repository with the built-in source order. */
    public LyricsRepository() {
        this(null);
    }

    /**
     * Repository over an explicit provider list (mainly for tests).
     *
     * @param providers ordered sources; {@code null}/empty falls back to the defaults
     */
    public LyricsRepository(List<LyricsProvider> providers) {
        this.providers = (providers == null || providers.isEmpty())
            ? DEFAULT_PROVIDERS
            : Collections.unmodifiableList(new ArrayList<>(providers));
    }

    /**
     * Look the song up online, source by source.
     *
     * @return the winning {@link Result} (source tag + LRC text), or {@code null}
     *         when no provider produced lyrics
     */
    public Result fetch(String title, String artist) {
        if (title == null || title.isEmpty()) return null;
        for (LyricsProvider provider : providers) {
            for (int attempt = 1; attempt <= ATTEMPTS_PER_PROVIDER; attempt++) {
                try {
                    String lyrics = provider.fetch(title, artist);
                    if (lyrics != null && !lyrics.trim().isEmpty()) {
                        if (attempt > 1) Log.i(TAG, provider.name() + " matched on retry");
                        return new Result(provider.name(), lyrics);
                    }
                    Log.d(TAG, provider.name() + " found nothing (attempt " + attempt + ")");
                } catch (Exception e) {
                    // Keep the chain alive: log, retry once below, then fall through.
                    Log.w(TAG, provider.name() + " threw on attempt " + attempt + ": " + e, e);
                }
            }
        }
        Log.i(TAG, "no online lyrics found for: " + title);
        return null;
    }

    /** A successful lookup: which source answered plus its LRC text. */
    public static final class Result {

        /** Provider tag that produced the lyrics, e.g. {@code net} / {@code qq}. */
        public final String source;

        /** Raw LRC text, never null/blank. */
        public final String lyrics;

        Result(String source, String lyrics) {
            this.source = source;
            this.lyrics = lyrics;
        }
    }
}
