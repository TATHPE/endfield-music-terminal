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
 * <p>The caller has to tell three situations apart, so {@link Result} carries an
 * {@link Result.Outcome}:
 * <ul>
 *   <li>{@code OK} — some provider returned lyrics;</li>
 *   <li>{@code NO_MATCH} — the sources answered (or at least one of them got
 *       through) and simply had nothing for this song;</li>
 *   <li>{@code FAILED} — no provider ever completed: every request failed in
 *       transport, i.e. the network is down. Only this case is surfaced to the
 *       user as an error instead of "not found".</li>
 * </ul>
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
     * @return never {@code null}: {@link Result.Outcome#OK} with the lyrics,
     *         {@link Result.Outcome#NO_MATCH}, or {@link Result.Outcome#FAILED}
     *         with the last transport error when nothing could be reached
     */
    public Result fetch(String title, String artist) {
        if (title == null || title.isEmpty()) return Result.noMatch();
        String lastError = null;
        // A provider counts as "reached" as soon as one attempt returns normally,
        // even an empty answer: that is a no-match, not a network failure.
        boolean anyProviderReached = false;
        for (LyricsProvider provider : providers) {
            boolean reached = false;
            for (int attempt = 1; attempt <= ATTEMPTS_PER_PROVIDER; attempt++) {
                try {
                    String lyrics = provider.fetch(title, artist);
                    reached = true;
                    if (lyrics != null && !lyrics.trim().isEmpty()) {
                        if (attempt > 1) Log.i(TAG, provider.name() + " matched on retry");
                        return Result.ok(provider.name(), lyrics);
                    }
                    Log.d(TAG, provider.name() + " found nothing (attempt " + attempt + ")");
                } catch (Exception e) {
                    // Keep the chain alive: log, retry once below, then fall through.
                    lastError = describe(e);
                    Log.w(TAG, provider.name() + " failed on attempt " + attempt + ": " + e, e);
                }
            }
            if (reached) anyProviderReached = true;
        }
        if (!anyProviderReached && lastError != null) {
            Log.w(TAG, "every online lyric source was unreachable for: " + title);
            return Result.failed(lastError);
        }
        Log.i(TAG, "no online lyrics found for: " + title);
        return Result.noMatch();
    }

    /** Human-readable cause for the rejected plugin call (provider name stays in the log). */
    private static String describe(Exception e) {
        String msg = e.getMessage();
        return (msg == null || msg.isEmpty()) ? e.getClass().getSimpleName() : msg;
    }

    /** Outcome of a lookup, plus whichever payload belongs to it. */
    public static final class Result {

        public enum Outcome { OK, NO_MATCH, FAILED }

        public final Outcome outcome;

        /** Provider tag that produced the lyrics, e.g. {@code net} / {@code qq}; null unless OK. */
        public final String source;

        /** Raw LRC text, never null/blank; null unless OK. */
        public final String lyrics;

        /** Transport error description; null unless FAILED. */
        public final String error;

        private Result(Outcome outcome, String source, String lyrics, String error) {
            this.outcome = outcome;
            this.source = source;
            this.lyrics = lyrics;
            this.error = error;
        }

        static Result ok(String source, String lyrics) {
            return new Result(Outcome.OK, source, lyrics, null);
        }

        static Result noMatch() {
            return new Result(Outcome.NO_MATCH, null, null, null);
        }

        static Result failed(String error) {
            return new Result(Outcome.FAILED, null, null, error);
        }
    }
}
