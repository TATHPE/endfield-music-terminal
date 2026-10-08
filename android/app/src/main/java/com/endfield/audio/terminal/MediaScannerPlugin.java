package com.endfield.audio.terminal;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.core.app.ActivityCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * MediaScanner - scan the device's MediaStore for audio files, resolve lyrics
 * (same-directory .lrc/.txt first, then NetEase Cloud Music lyric API), and
 * read album art as base64.
 *
 * Permissions: READ_MEDIA_AUDIO on API 33+, READ_EXTERNAL_STORAGE below.
 * The runtime permission is requested with plain ActivityCompat.requestPermissions
 * (not Capacitor's requestPermissionForAlias, which can fail silently and never
 * show the system dialog on some ColorOS/OriginOS builds). The result is delivered
 * through Plugin.onRequestPermissionsResult, which the Bridge forwards.
 */
@CapacitorPlugin(name = "MediaScanner")
public class MediaScannerPlugin extends Plugin {

    private static final String UA =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

    /** Shared background pool for network cover/lyric lookups, so the UI thread
     *  is never blocked by HTTP I/O (these used to run inline on the bridge
     *  thread and could stall playback on slow links). */
    private static final ExecutorService IO_POOL =
        Executors.newFixedThreadPool(Math.max(2, Runtime.getRuntime().availableProcessors() / 2));

    static final int REQ_AUDIO = 2001;
    private static PluginCall sPending;
    private static MediaScannerPlugin sInstance;

    private boolean hasAudioPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            // Android 13+ officially uses READ_MEDIA_AUDIO, but several ROMs
            // (OriginOS / ColorOS variants) still gate media access through the
            // legacy READ_EXTERNAL_STORAGE grant in their permission UI, so a
            // user may have toggled "Storage" and nothing else. Accept either.
            boolean audio = ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.READ_MEDIA_AUDIO)
                == PackageManager.PERMISSION_GRANTED;
            boolean legacy = ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.READ_EXTERNAL_STORAGE)
                == PackageManager.PERMISSION_GRANTED;
            return audio || legacy;
        }
        return ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.READ_EXTERNAL_STORAGE)
            == PackageManager.PERMISSION_GRANTED;
    }

    private String[] audioPermissionNames() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            // Request both: the OS grants whichever one it maps the dialog to.
            return new String[]{Manifest.permission.READ_MEDIA_AUDIO, Manifest.permission.READ_EXTERNAL_STORAGE};
        }
        return new String[]{Manifest.permission.READ_EXTERNAL_STORAGE};
    }

    private void ensurePermission(PluginCall call) {
        if (hasAudioPermission()) {
            doScan(call);
            return;
        }
        // Android guideline: if the user already denied once (system would only
        // show a "deny silently" dialog or nothing at all), don't re-prompt —
        // route straight to the settings guidance. First-time requests go through
        // the normal system dialog.
        if (getActivity() != null
                && ActivityCompat.shouldShowRequestPermissionRationale(getActivity(), audioPermissionNames()[0])) {
            call.reject("PERM_DENIED|存储权限未授予，请在系统设置中允许「音乐和音频」权限后重试。");
            return;
        }
        sInstance = this;
        sPending = call;
        // Plain system permission request on the UI thread. The result is
        // delivered back by MainActivity.onRequestPermissionsResult ->
        // notifyPermissionResult, bypassing Capacitor's alias callback path
        // entirely (that path silently fails to show the dialog on some
        // ColorOS / OriginOS / HyperOS builds).
        getActivity().runOnUiThread(() ->
            ActivityCompat.requestPermissions(
                getActivity(), audioPermissionNames(), REQ_AUDIO));
    }

    /** Called from MainActivity.onRequestPermissionsResult with the dialog outcome. */
    public static void notifyPermissionResult(boolean granted) {
        PluginCall call = sPending;
        sPending = null;
        if (call == null || sInstance == null) return;
        if (granted) {
            sInstance.doScan(call);
        } else {
            call.reject("PERM_DENIED|存储权限被拒绝，无法扫描设备歌曲。请在系统设置中允许「音乐和音频」权限后重试。");
        }
    }

    /** Scan MediaStore for audio files. Returns [{id,title,artist,album,albumId,duration,path,size,mime}]. */
    @PluginMethod
    public void scanAudio(PluginCall call) {
        ensurePermission(call);
    }

    /** Open the system app-details settings page so the user can grant audio permission manually. */
    @PluginMethod
    public void openSettings(PluginCall call) {
        final android.app.Activity act = getActivity();
        final android.content.Context ctx = getContext();
        try {
            android.content.Intent intent =
                new android.content.Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    android.net.Uri.fromParts("package", ctx.getPackageName(), null));
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            if (act != null) {
                // Launch from the Activity on the UI thread — some ColorOS builds
                // block settings intents started from the application context.
                act.runOnUiThread(() -> {
                    try {
                        act.startActivity(intent);
                        call.resolve();
                    } catch (Exception ex) {
                        openAppSettingsFallback(call, ctx, intent);
                    }
                });
            } else {
                ctx.startActivity(intent);
                call.resolve();
            }
        } catch (Exception e) {
            openAppSettingsFallback(call, ctx, null);
        }
    }

    /** Fallback: app-management list (device-wide) when the details page can't be opened. */
    private void openAppSettingsFallback(PluginCall call, android.content.Context ctx, android.content.Intent first) {
        try {
            android.content.Intent fallback =
                new android.content.Intent(android.provider.Settings.ACTION_MANAGE_APPLICATIONS_SETTINGS);
            fallback.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(fallback);
            call.resolve();
        } catch (Exception e2) {
            call.reject("无法打开系统设置，请手动前往：设置 → 应用 → 终末地音乐终端 → 权限。");
        }
    }

    private void doScan(PluginCall call) {
        try {
            ContentResolver cr = getContext().getContentResolver();
            Uri uri = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
            String[] proj = {
                MediaStore.Audio.Media._ID,
                MediaStore.Audio.Media.TITLE,
                MediaStore.Audio.Media.ARTIST,
                MediaStore.Audio.Media.ALBUM,
                MediaStore.Audio.Media.ALBUM_ID,
                MediaStore.Audio.Media.DURATION,
                MediaStore.Audio.Media.DATA,
                MediaStore.Audio.Media.SIZE,
                MediaStore.Audio.Media.MIME_TYPE
            };
            String selection = MediaStore.Audio.Media.DURATION + " > 0 AND " + MediaStore.Audio.Media.SIZE + " > 0";
            JSArray arr = new JSArray();
            try (Cursor c = cr.query(uri, proj, selection, null, MediaStore.Audio.Media.TITLE + " ASC")) {
                if (c != null) {
                    // Resolve column indexes once; a missing column on some ROM
                    // must not abort the whole scan (getColumnIndex returns -1).
                    int iId = c.getColumnIndex(MediaStore.Audio.Media._ID);
                    int iTitle = c.getColumnIndex(MediaStore.Audio.Media.TITLE);
                    int iArtist = c.getColumnIndex(MediaStore.Audio.Media.ARTIST);
                    int iAlbum = c.getColumnIndex(MediaStore.Audio.Media.ALBUM);
                    int iAlbumId = c.getColumnIndex(MediaStore.Audio.Media.ALBUM_ID);
                    int iDur = c.getColumnIndex(MediaStore.Audio.Media.DURATION);
                    int iData = c.getColumnIndex(MediaStore.Audio.Media.DATA);
                    int iSize = c.getColumnIndex(MediaStore.Audio.Media.SIZE);
                    int iMime = c.getColumnIndex(MediaStore.Audio.Media.MIME_TYPE);
                    while (c.moveToNext()) {
                        try {
                            JSObject o = new JSObject();
                            o.put("id", iId >= 0 ? c.getLong(iId) : 0L);
                            String t = iTitle >= 0 ? c.getString(iTitle) : null;
                            o.put("title", t == null ? "" : t);
                            String ar = iArtist >= 0 ? c.getString(iArtist) : null;
                            o.put("artist", ar == null ? "" : ar);
                            String al = iAlbum >= 0 ? c.getString(iAlbum) : null;
                            o.put("album", al == null ? "" : al);
                            o.put("albumId", iAlbumId >= 0 ? c.getLong(iAlbumId) : 0L);
                            o.put("duration", iDur >= 0 ? c.getLong(iDur) : 0L);
                            o.put("size", iSize >= 0 ? c.getLong(iSize) : 0L);
                            String mime = iMime >= 0 ? c.getString(iMime) : null;
                            o.put("mime", mime == null ? "" : mime);
                            String path = iData >= 0 ? c.getString(iData) : null;
                            // Skip entries whose playable path is unknown (partitioned
                            // storage on Android 10+ can return null for _data) instead
                            // of failing the scan.
                            if (path == null || path.isEmpty()) continue;
                            o.put("path", path);
                            arr.put(o);
                        } catch (Exception rowErr) {
                            // A single unreadable row must never abort the whole scan.
                            continue;
                        }
                    }
                }
            }
            JSObject ret = new JSObject();
            ret.put("songs", arr);
            call.resolve(ret);
        } catch (SecurityException se) {
            // Access denied by the OS despite our checks — report as permission issue.
            call.reject("PERM_DENIED|存储权限未生效，无法读取设备音频。请到系统设置确认「音乐和音频」权限已开启。");
        } catch (Exception e) {
            // Include the exception class + message so the UI can surface the real
            // cause instead of a generic "permission denied" misreport.
            call.reject("SCAN_ERR|扫描设备音频失败: " + e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    /**
     * Read only the same-directory sidecar lyric (.lrc/.txt with the same base
     * name). Never touches the network — used during library scans so newly
     * scanned songs are matched offline only.
     * Returns {source:'file'|null, lyrics}.
     */
    @PluginMethod
    public void getLyricsLocal(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("缺少文件路径");
            return;
        }
        JSObject ret = new JSObject();
        try {
            String lrc = readSidecar(path, ".lrc");
            if (lrc == null) lrc = readSidecar(path, ".txt");
            if (lrc != null && !lrc.trim().isEmpty()) {
                ret.put("source", "file");
                ret.put("lyrics", lrc);
            } else {
                ret.put("source", JSObject.NULL);
                ret.put("lyrics", JSObject.NULL);
            }
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("本地歌词读取失败: " + e.getMessage());
        }
    }

    /**
     * Match lyrics online (NetEase first, then QQ Music as a fallback source),
     * executed on the background thread pool so HTTP I/O never blocks the UI
     * thread. Invoked explicitly from the lyrics panel (user-triggered).
     * Returns {source:'net'|null, lyrics}.
     */
    @PluginMethod
    public void getLyricsOnline(PluginCall call) {
        String title = call.getString("title", "");
        String artist = call.getString("artist", "");
        if (title == null || title.isEmpty()) {
            call.reject("缺少歌曲标题");
            return;
        }
        IO_POOL.execute(() -> {
            try {
                String net = neteaseLyric(title, artist);
                if (net == null || net.trim().isEmpty()) net = qqLyric(title, artist);
                JSObject ret = new JSObject();
                if (net != null && !net.trim().isEmpty()) {
                    ret.put("source", "net");
                    ret.put("lyrics", net);
                } else {
                    ret.put("source", JSObject.NULL);
                    ret.put("lyrics", JSObject.NULL);
                }
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("联网歌词获取失败: " + e.getMessage());
            }
        });
    }

    /** Read same-directory sidecar (same base name + ext), UTF-8, capped at 256 KB. */
    private String readSidecar(String path, String ext) {
        int dot = path.lastIndexOf('.');
        String base = dot > 0 ? path.substring(0, dot) : path;
        for (String cand : new String[]{base + ext, base + ext.toUpperCase()}) {
            File f = new File(cand);
            if (f.exists() && f.isFile() && f.length() <= 262144) {
                try (FileInputStream in = new FileInputStream(f)) {
                    byte[] buf = new byte[(int) f.length()];
                    int off = 0, n;
                    while (off < buf.length && (n = in.read(buf, off, buf.length - off)) > 0) off += n;
                    return new String(buf, 0, off, StandardCharsets.UTF_8);
                } catch (Exception ignored) {
                }
            }
        }
        return null;
    }

    /** Search NetEase Cloud Music for the song id, then fetch its LRC lyric. */
    private String neteaseLyric(String title, String artist) throws IOException {
        if (title == null || title.isEmpty()) return null;
        // First try title + artist, then retry with the bare title — the artist
        // token often contains separators/remix tags that break the search.
        String lyric = neteaseSearch(title, artist);
        if (lyric == null) lyric = neteaseSearch(title, null);
        return lyric;
    }

    private String neteaseSearch(String title, String artist) throws IOException {
        String query = (artist == null || artist.isEmpty()) ? title : title + " " + artist;
        String enc = URLEncoder.encode(query, "UTF-8");
        String searchUrl = "https://music.163.com/api/search/get/web?csrf_token=&s=" + enc + "&type=1&limit=5";
        String searchJson = httpGet(searchUrl);
        long id = -1;
        if (searchJson != null) {
            try {
                org.json.JSONObject root = new org.json.JSONObject(searchJson);
                org.json.JSONObject result = root.optJSONObject("result");
                if (result != null) {
                    org.json.JSONArray songs = result.optJSONArray("songs");
                    if (songs != null && songs.length() > 0) {
                        // Pick the hit whose title matches the query best instead of
                        // blindly taking the first result (search can return wrong
                        // albums/remixes at the top).
                        String cleanTitle = cleanTitle(title);
                        double best = -1;
                        for (int i = 0; i < songs.length(); i++) {
                            org.json.JSONObject s = songs.getJSONObject(i);
                            String hit = s.optString("name", "");
                            double score = titleScore(cleanTitle, cleanTitle(hit));
                            if (score > best) {
                                best = score;
                                id = s.optLong("id", -1);
                            }
                        }
                        if (id <= 0) {
                            id = songs.getJSONObject(0).optLong("id", -1);
                        }
                    }
                }
            } catch (org.json.JSONException ignored) {
            }
        }
        if (id <= 0) return null;
        String lyricUrl = "https://music.163.com/api/song/lyric?id=" + id + "&lv=-1&kv=-1&tv=-1";
        String lyricJson = httpGet(lyricUrl);
        if (lyricJson != null) {
            try {
                org.json.JSONObject root = new org.json.JSONObject(lyricJson);
                org.json.JSONObject lrc = root.optJSONObject("lrc");
                if (lrc != null) {
                    String lyric = lrc.optString("lyric", "");
                    if (!lyric.isEmpty()) return lyric;
                }
            } catch (org.json.JSONException ignored) {
            }
        }
        return null;
    }

    /** Tencent Music (QQ) lyric fallback: search by songmid, fetch the LRC. */
    private String qqLyric(String title, String artist) throws IOException {
        if (title == null || title.isEmpty()) return null;
        String query = (artist == null || artist.isEmpty()) ? title : title + " " + artist;
        String enc = URLEncoder.encode(query, "UTF-8");
        String searchUrl = "https://c.y.qq.com/soso/fcgi-bin/client_search_cp?format=json&p=1&n=5&w=" + enc;
        String searchJson = httpGetRef(searchUrl, "https://y.qq.com/");
        String songmid = null;
        if (searchJson != null) {
            try {
                org.json.JSONObject root = new org.json.JSONObject(searchJson);
                org.json.JSONObject data = root.optJSONObject("data");
                if (data != null) {
                    org.json.JSONObject song = data.optJSONObject("song");
                    if (song != null) {
                        org.json.JSONArray list = song.optJSONArray("list");
                        if (list != null && list.length() > 0) {
                            String cleanTitle = cleanTitle(title);
                            double best = -1;
                            for (int i = 0; i < list.length(); i++) {
                                org.json.JSONObject s = list.getJSONObject(i);
                                String hit = s.optString("songname", "");
                                double score = titleScore(cleanTitle, cleanTitle(hit));
                                if (score > best) {
                                    best = score;
                                    songmid = s.optString("songmid", "");
                                }
                            }
                            if (songmid == null || songmid.isEmpty()) {
                                songmid = list.getJSONObject(0).optString("songmid", "");
                            }
                        }
                    }
                }
            } catch (org.json.JSONException ignored) {
            }
        }
        if (songmid == null || songmid.isEmpty()) return null;
        String lyricUrl = "https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?format=json&songmid=" + songmid;
        String lyricJson = httpGetRef(lyricUrl, "https://y.qq.com/");
        if (lyricJson != null) {
            try {
                org.json.JSONObject root = new org.json.JSONObject(lyricJson);
                String lyric = root.optString("lyric", "");
                if (!lyric.isEmpty()) {
                    // Usually base64-encoded LRC; some builds return plain text.
                    try {
                        byte[] dec = Base64.decode(lyric, Base64.DEFAULT);
                        String lrc = new String(dec, StandardCharsets.UTF_8);
                        if (!lrc.trim().isEmpty()) return lrc;
                    } catch (IllegalArgumentException ignored) {
                        if (!lyric.trim().isEmpty()) return lyric;
                    }
                }
            } catch (org.json.JSONException ignored) {
            }
        }
        return null;
    }

    /** Normalize a title for matching: strip track numbers, brackets and extension noise. */
    private String cleanTitle(String raw) {        if (raw == null) return "";
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
    private double titleScore(String a, String b) {
        if (a.isEmpty() || b.isEmpty()) return 0;
        if (a.equals(b)) return 1;
        if (a.contains(b) || b.contains(a)) return 0.8;
        int common = 0;
        for (int i = 0; i < a.length() && i < b.length(); i++) {
            if (a.charAt(i) == b.charAt(i)) common++;
        }
        return (double) common / Math.max(a.length(), b.length());
    }

    private String httpGet(String urlStr) throws IOException {
        return httpGetRef(urlStr, "https://music.163.com/");
    }

    private String httpGetRef(String urlStr, String referer) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(15000);
        conn.setRequestMethod("GET");
        conn.setRequestProperty("User-Agent", UA);
        if (referer != null) conn.setRequestProperty("Referer", referer);
        conn.setRequestProperty("Accept", "application/json, text/plain, */*");
        int code = conn.getResponseCode();
        if (code != 200) {
            conn.disconnect();
            return null;
        }
        StringBuilder sb = new StringBuilder();
        try (BufferedReader br = new BufferedReader(
                new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = br.readLine()) != null) sb.append(line);
        }
        conn.disconnect();
        return sb.toString();
    }

    /** Read album art for an album id from MediaStore albumart, return base64 PNG/JPEG.
     *  Local sources (MediaStore / album table / embedded cover) are read inline
     *  (fast, no I/O stalls); the online iTunes fallback is delegated to the
     *  background thread pool so the UI thread never blocks on HTTP. */
    @PluginMethod
    public void getAlbumArt(PluginCall call) {
        Long albumId = call.getLong("albumId");
        String path = call.getString("path", "");
        String title = call.getString("title", "");
        String artist = call.getString("artist", "");
        if (albumId == null || albumId <= 0) {
            call.resolve(new JSObject().put("base64", JSObject.NULL));
            return;
        }
        String b64 = null;
        // 1) MediaStore albumart URI (partitioned storage can block this on 10+).
        Uri artUri = Uri.parse("content://media/external/audio/albumart/" + albumId);
        b64 = readUriAsBase64(artUri);
        // 2) Albums table ALBUM_ART path column.
        if (b64 == null) {
            b64 = readAlbumArtPath(albumId);
        }
        // 3) Embedded cover inside the audio file itself (most reliable on
        //    ColorOS / OriginOS where the above are often null under
        //    partitioned storage).
        if (b64 == null && path != null && !path.isEmpty()) {
            b64 = readEmbeddedArt(path);
        }
        // 4) Online cover match (Apple iTunes public API) — many local tracks
        //    carry no embedded art at all. Runs on the background pool.
        if (b64 == null && title != null && !title.isEmpty()) {
            final String t = title;
            final String a = artist;
            IO_POOL.execute(() -> {
                try {
                    String net = onlineCover(t, a);
                    if (net != null && !net.isEmpty()) {
                        JSObject ret = new JSObject();
                        ret.put("base64", net);
                        call.resolve(ret);
                        return;
                    }
                } catch (Exception ignored) {
                }
                call.resolve(new JSObject().put("base64", JSObject.NULL));
            });
            return;
        }
        JSObject ret = new JSObject();
        ret.put("base64", b64 != null ? b64 : JSObject.NULL);
        call.resolve(ret);
    }

    /** Match a cover online via the Apple iTunes public search API and download it. */
    private String onlineCover(String title, String artist) throws IOException {
        String query = (artist == null || artist.isEmpty()) ? title : title + " " + artist;
        String enc = URLEncoder.encode(query, "UTF-8");
        String searchUrl = "https://itunes.apple.com/search?term=" + enc + "&media=music&limit=5&country=CN";
        String searchJson = httpGet(searchUrl);
        if (searchJson == null) return null;
        String artUrl = null;
        try {
            org.json.JSONObject root = new org.json.JSONObject(searchJson);
            org.json.JSONArray results = root.optJSONArray("results");
            if (results != null && results.length() > 0) {
                String cleanTitle = cleanTitle(title);
                double best = -1;
                for (int i = 0; i < results.length(); i++) {
                    org.json.JSONObject r = results.getJSONObject(i);
                    String hit = r.optString("trackName", "");
                    double score = titleScore(cleanTitle, cleanTitle(hit));
                    if (score > best) {
                        best = score;
                        artUrl = r.optString("artworkUrl100", "");
                    }
                }
                if (artUrl == null || artUrl.isEmpty()) {
                    artUrl = results.getJSONObject(0).optString("artworkUrl100", "");
                }
                // Request a larger tile than the default 100x100.
                if (artUrl != null && artUrl.contains("100x100bb")) {
                    artUrl = artUrl.replace("100x100bb", "300x300bb");
                }
            }
        } catch (org.json.JSONException ignored) {
        }
        if (artUrl == null || artUrl.isEmpty()) return null;
        return downloadImageAsBase64(artUrl);
    }

    private String downloadImageAsBase64(String urlStr) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
        conn.setConnectTimeout(10000);
        conn.setReadTimeout(10000);
        conn.setRequestMethod("GET");
        conn.setRequestProperty("User-Agent", UA);
        int code = conn.getResponseCode();
        if (code != 200) {
            conn.disconnect();
            return null;
        }
        byte[] data = readAll(conn.getInputStream());
        conn.disconnect();
        if (data.length < 64) return null;
        return Base64.encodeToString(data, Base64.NO_WRAP);
    }

    /** Extract the embedded album art (ID3/APIC etc.) from an audio file via MediaMetadataRetriever. */
    private String readEmbeddedArt(String path) {
        try {
            android.media.MediaMetadataRetriever r = new android.media.MediaMetadataRetriever();
            try {
                r.setDataSource(path);
                byte[] pic = r.getEmbeddedPicture();
                if (pic != null && pic.length >= 64) {
                    return Base64.encodeToString(pic, Base64.NO_WRAP);
                }
            } finally {
                r.release();
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    /** Read a device audio file into a base64 payload so the WebView can play it
     *  as a Blob. Blob playback is fully seekable — WebViewAssetLoader streams are
     *  not reliably Range-capable on ColorOS, which is what made lock-screen
     *  scrubbers bounce back. Files above the cap fall back to the asset URL. */
    @PluginMethod
    public void getAudioData(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("缺少文件路径");
            return;
        }
        File f = new File(path);
        if (!f.exists() || !f.isFile()) {
            call.reject("文件不存在: " + path);
            return;
        }
        if (f.length() > MAX_AUDIO_BYTES) {
            JSObject ret = new JSObject();
            ret.put("tooLarge", true);
            call.resolve(ret);
            return;
        }
        try (FileInputStream in = new FileInputStream(f)) {
            byte[] data = readAll(in);
            JSObject ret = new JSObject();
            ret.put("base64", Base64.encodeToString(data, Base64.NO_WRAP));
            ret.put("mime", mimeFor(path));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("读取音频失败: " + e.getMessage());
        }
    }

    private static final long MAX_AUDIO_BYTES = 50L * 1024 * 1024; // 50 MB

    private String mimeFor(String path) {
        String lower = path.toLowerCase();
        if (lower.endsWith(".flac")) return "audio/flac";
        if (lower.endsWith(".wav")) return "audio/wav";
        if (lower.endsWith(".m4a")) return "audio/mp4";
        if (lower.endsWith(".aac")) return "audio/aac";
        if (lower.endsWith(".ogg")) return "audio/ogg";
        if (lower.endsWith(".opus")) return "audio/ogg";
        if (lower.endsWith(".ape")) return "audio/x-ape";
        if (lower.endsWith(".wma")) return "audio/x-ms-wma";
        return "audio/mpeg";
    }

    private String readUriAsBase64(Uri uri) {
        try {
            InputStream in = getContext().getContentResolver().openInputStream(uri);
            if (in == null) return null;
            byte[] data = readAll(in);
            in.close();
            if (data.length < 64) return null;
            return Base64.encodeToString(data, Base64.NO_WRAP);
        } catch (Exception ignored) {
            return null;
        }
    }

    private String readAlbumArtPath(long albumId) {
        try {
            ContentResolver cr = getContext().getContentResolver();
            Uri albumsUri = MediaStore.Audio.Albums.EXTERNAL_CONTENT_URI;
            String[] proj = { MediaStore.Audio.Albums.ALBUM_ART };
            try (Cursor c = cr.query(albumsUri, proj,
                    MediaStore.Audio.Albums._ID + "=?", new String[]{String.valueOf(albumId)}, null)) {
                if (c != null && c.moveToFirst()) {
                    String p = c.getString(0);
                    if (p != null) {
                        File f = new File(p);
                        if (f.exists()) {
                            try (FileInputStream in = new FileInputStream(f)) {
                                byte[] data = readAll(in);
                                if (data.length >= 64)
                                    return Base64.encodeToString(data, Base64.NO_WRAP);
                            }
                        }
                    }
                }
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    private byte[] readAll(InputStream in) throws IOException {
        java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
        return bos.toByteArray();
    }
}
