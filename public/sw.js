/* Endfield Audio Terminal — offline app-shell service worker.
 *
 * Web build only: the native APK never registers this file (see src/index.tsx),
 * because Capacitor already ships the whole bundle inside the APK.
 *
 * Strategy summary
 *   install  : precache the shell ('/', '/index.html'), then skipWaiting()
 *   activate : drop stale cache generations, then clients.claim()
 *   fetch    : navigations        -> network-first, cache fallback (offline boot)
 *              same-origin static -> cache-first, revalidate in background
 *              everything else    -> pass through untouched
 *   never cached: /songs/** (preset tracks are 100+ MB in total), cross-origin
 *              metadata APIs, non-GET and Range requests, oversized responses.
 */

const CACHE_PREFIX = 'endfield-shell-';
const CACHE_VERSION = `${CACHE_PREFIX}v1`;

// Minimal shell: the SPA entry points. Hashed JS/CSS land in the cache lazily on
// first request, which keeps the install fast and avoids a stale asset list.
const SHELL_ASSETS = ['/', '/index.html'];

// Preset tracks are shipped from here and easily total >100 MB — Cache Storage
// must never absorb them.
const SONG_PATH_PREFIX = '/songs/';

// Cross-origin metadata lookups (NetEase / QQ Music / iTunes): responses are
// personalised and unbounded, so they stay on the network.
const BLOCKED_HOSTS = new Set([
  'music.163.com',
  'c.y.qq.com',
  'itunes.apple.com',
]);

// Request.destination values we are willing to store (js / css / images / fonts).
const STATIC_DESTINATIONS = new Set(['script', 'style', 'image', 'font']);

// Hard ceiling per cache entry: a safety net for any static asset whose size we
// cannot confirm from Content-Length.
const MAX_ENTRY_BYTES = 8 * 1024 * 1024;

/** Never touched by the cache: non-GET, cross-origin, songs, Range requests. */
function isOffLimits(request) {
  if (request.method !== 'GET') return true;
  // Partial (audio seeking) responses must not be cached.
  if (request.headers.has('range')) return true;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return true;
  }
  // blob:, data:, chrome-extension:, ... — plus every cross-origin request,
  // which covers the metadata APIs and the CDN-hosted assets.
  if (url.origin !== self.location.origin) return true;
  if (url.pathname.startsWith(SONG_PATH_PREFIX)) return true;
  if (BLOCKED_HOSTS.has(url.hostname)) return true;
  return false;
}

function isCacheableStatic(request) {
  return (
    !isOffLimits(request) && STATIC_DESTINATIONS.has(request.destination)
  );
}

/** True when a response is safe (and worth) storing. */
function isStorable(response) {
  // status 200 only: skips opaque redirects, 206 partials and error pages.
  return (
    response.status === 200 &&
    response.type === 'basic' &&
    !response.headers.has('content-range')
  );
}

/**
 * Store a response unless it looks like a big file. `response` is a clone owned
 * by this function; the caller hands the network response to the page.
 */
async function putIfSmallEnough(cache, request, response) {
  if (!isStorable(response)) return;

  const rawLength = response.headers.get('content-length');
  const declared = rawLength === null ? Number.NaN : Number(rawLength);
  if (Number.isFinite(declared) && declared > MAX_ENTRY_BYTES) return;

  try {
    if (Number.isFinite(declared)) {
      await cache.put(request, response);
      return;
    }
    // Unknown size: measure the clone before committing it to the cache.
    const body = await response.blob();
    if (body.size > MAX_ENTRY_BYTES) return;
    await cache.put(
      request,
      new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      }),
    );
  } catch {
    // Quota exceeded, opaque response, aborted body — offline support is
    // best-effort, so a cache write failure is not worth surfacing.
  }
}

/**
 * Fetch handlers do bookkeeping after they hand the response to the page, but
 * ExtendableEvent.waitUntil() is only honoured while the event is dispatching —
 * so the promise is handed over synchronously here and settled later, once the
 * background cache write is done. Without this the worker could be torn down
 * mid-write and silently drop the entry.
 */
function keepAlive(event) {
  let settle;
  event.waitUntil(
    new Promise((resolve) => {
      settle = resolve;
    }),
  );
  return settle;
}

/** Navigations: fresh HTML when the network is up, cached shell when it is not. */
async function handleNavigate(event) {
  const done = keepAlive(event);
  const { request } = event;
  try {
    const cache = await caches.open(CACHE_VERSION);
    try {
      const response = await fetch(request);
      if (isStorable(response)) {
        // Clone synchronously so the page keeps its own readable copy.
        await putIfSmallEnough(cache, request, response.clone());
      }
      return response;
    } catch {
      const cached =
        (await cache.match(request)) ||
        (await cache.match('/index.html')) ||
        (await cache.match('/'));
      return cached || Response.error();
    }
  } finally {
    done();
  }
}

/** Static assets: serve from cache immediately, refresh the entry in background. */
async function handleStatic(event) {
  const done = keepAlive(event);
  const { request } = event;
  try {
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(request);

    const refresh = fetch(request)
      .then(async (response) => {
        if (isStorable(response)) {
          await putIfSmallEnough(cache, request, response.clone());
        }
        return response;
      })
      .finally(done);

    // Cache hit: answer at once and let the revalidation finish in background.
    if (cached) {
      void refresh.catch(() => undefined);
      return cached;
    }
    const fresh = await refresh.catch(() => undefined);
    return fresh || Response.error();
  } catch {
    done();
    return Response.error();
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      // Resilient precache: a single missing shell entry must not abort install.
      await Promise.all(
        SHELL_ASSETS.map((url) => cache.add(url).catch(() => undefined)),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_VERSION)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Songs, APIs, non-GET and Range requests bypass the worker entirely.
  if (isOffLimits(request)) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigate(event));
    return;
  }

  if (isCacheableStatic(request)) {
    event.respondWith(handleStatic(event));
    return;
  }

  // Anything else (XHR/fetch data calls, manifest, ...) is passed straight on.
  event.respondWith(fetch(request));
});
