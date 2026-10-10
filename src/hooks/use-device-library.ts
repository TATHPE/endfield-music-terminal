// EXPORTS: useDeviceLibrary
import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { toast } from 'sonner';
import type { ISong } from '@/lib/music';
import { formatCodec, makeId } from '@/lib/music';
import { getAllSongs, putSong } from '@/lib/db';
import { fetchItunesCover, parseAudioFile, toSong } from '@/lib/parser';
import { md5Hex } from '@/lib/md5';
import { MediaScanner, isNative, type DeviceSong } from '@/lib/media-scanner';
import type { LogLevel } from '@/lib/terminal-config';
import {
  baseNameOf,
  classifyEntry,
  isPlaylistFileName,
  parsePlaylistFile,
  type ParsedPlaylist,
} from '@/lib/playlist-file';

interface DeviceLibraryDeps {
  /** current library — used to resolve the song when fetching its lyrics */
  songs: ISong[];
  setSongs: Dispatch<SetStateAction<ISong[]>>;
  /** terminal log sink (level-gated by the 系统配置 LOG level) */
  appendLog: (line: string, level?: LogLevel) => void;
  /** 在线地址入库（PlayerProvider 的 addStreamSong）——歌单里的 http(s) 条目走这里 */
  addStream: (url: string, opts?: { silent?: boolean }) => Promise<{ ok: boolean; reason?: string }>;
  /** 播放序列 CRUD（usePlaylists 提供）——歌单文件会落成一个新的播放序列 */
  createPlaylist: (name: string) => string;
  addToPlaylist: (playlistId: string, songId: string) => void;
}

/**
 * Import / scan / lyrics domain, extracted from PlayerProvider (the code is
 * moved verbatim — behaviour is unchanged). Covers:
 * - `importFiles`  : user-picked files → parse metadata/cover → IndexedDB
 *                    （同时支持 .m3u / .m3u8 / .pls 歌单：在线流入库，本地条目
 *                     匹配曲库后落成一个新的播放序列）
 * - `scanDeviceSongs`: native MediaStore scan (dedupes by device path)
 * - `fetchLyricsOnline` / `importLyrics` / sidecar read: the lyric entry points
 */
export function useDeviceLibrary({
  songs,
  setSongs,
  appendLog,
  addStream,
  createPlaylist,
  addToPlaylist,
}: DeviceLibraryDeps) {
  const importFiles = useCallback(
    async (files: FileList | File[]) => {
      const picked = Array.from(files);
      // 歌单文件（.m3u / .m3u8 / .pls）不参与音频解析：它们的 MIME 也可能声明为
      // audio/x-mpegurl，必须显式排除，改走下面的歌单分支。
      const playlistFiles = picked.filter((f) => isPlaylistFileName(f.name));
      const list = picked.filter(
        (f) =>
          !isPlaylistFileName(f.name) &&
          (f.type.startsWith('audio/') ||
            /\.(mp3|flac|m4a|wav|ogg|aac|opus|ape|wma|aiff)$/i.test(f.name)),
      );
      if (list.length === 0 && playlistFiles.length === 0) {
        toast.error('未检测到音频文件');
        return;
      }

      // ---- 音频文件：过滤规则、日志与提示均保持原样 ----------------------
      if (list.length > 0) {
        appendLog(`SCAN DIR: /MEDIA/USB0`, 'trace');
        appendLog(`FOUND ${list.length} MEDIA FILE${list.length === 1 ? '' : 'S'}`);
        let ok = 0;
        let fail = 0;
        let duplicate = 0;
        let quotaHit = false;
        for (const file of list) {
          // Same name + same byte size is already in the library: importing it
          // again would only create a duplicate row.
          if (songs.some((s) => s.fileName === file.name && s.audio?.size === file.size)) {
            duplicate += 1;
            appendLog(`SKIP DUPLICATE ${file.name}`, 'trace');
            continue;
          }
          try {
            const meta = await parseAudioFile(file);
            const song = toSong(meta, file, makeId(), Date.now());
            await putSong(song);
            setSongs((prev) => [...prev, song]);
            ok += 1;
            appendLog(`LOAD TRACK ${file.name} OK (${formatCodec(song.codec)})`, 'trace');
            // Media integrity hash — computed off the critical path so large
            // files don't block the import loop.
            void (async () => {
              try {
                const buf = await file.arrayBuffer();
                const hash = md5Hex(buf);
                const updated = { ...song, hash };
                await putSong(updated);
                setSongs((prev) => prev.map((s) => (s.id === song.id ? updated : s)));
              } catch {
                /* hash is best-effort */
              }
            })();
            if (!song.cover) {
              void fetchItunesCover(song.artist, song.title, song.album).then((cover) => {
                if (!cover) return;
                const updated = { ...song, cover };
                void putSong(updated).then(() => {
                  setSongs((prev) => prev.map((s) => (s.id === song.id ? updated : s)));
                });
              });
            }
          } catch (err) {
            fail += 1;
            if (err instanceof Error && err.name === 'QuotaExceededError') {
              quotaHit = true;
              appendLog(`LOAD TRACK ${file.name} FAILED — STORAGE QUOTA EXCEEDED`, 'error');
            } else {
              appendLog(`LOAD TRACK ${file.name} FAILED — FORMAT UNSUPPORTED`, 'warn');
            }
          }
        }
        if (ok > 0) {
          appendLog(
            `IMPORT COMPLETE: ${ok} OK / ${fail} FAILED${duplicate > 0 ? ` / ${duplicate} DUPLICATE` : ''}`,
          );
          toast.success(
            `已导入 ${ok} 首曲目${fail > 0 ? `，${fail} 首解析失败` : ''}${duplicate > 0 ? `，跳过 ${duplicate} 首重复` : ''}`,
          );
        } else if (quotaHit) {
          toast.error('存储空间不足，导入失败——请清理介质库后重试');
        } else if (fail === 0 && duplicate > 0) {
          toast.info(`这 ${duplicate} 首已在介质库中，已跳过`);
        } else if (fail > 0) {
          toast.error('导入失败，请检查音频文件格式');
        }
      }

      // ---- 歌单文件：在线流入库 / 本地条目匹配成新的播放序列 --------------
      if (playlistFiles.length > 0) {
        // 本地条目按「文件名 / 歌名」与现有曲库比对（忽略大小写与扩展名）。
        const byName = new Map<string, ISong>();
        for (const song of songs) {
          for (const raw of [song.title, song.fileName]) {
            const key = baseNameOf(raw).toLowerCase();
            if (key && !byName.has(key)) byName.set(key, song);
          }
        }
        let streams = 0;
        let streamFailed = 0;
        let matched = 0;
        let unmatched = 0;
        let ignored = 0;
        for (const file of playlistFiles) {
          let parsed: ParsedPlaylist;
          try {
            parsed = parsePlaylistFile(file.name, await file.text());
          } catch {
            appendLog(`PLAYLIST ${file.name} FAILED — READ ERROR`, 'warn');
            continue;
          }
          ignored += parsed.skipped;
          if (parsed.entries.length === 0) {
            appendLog(`PLAYLIST ${file.name} — NO USABLE ENTRY`, 'warn');
            continue;
          }
          // 在线流：交给 addStream 入库（地址校验在该函数内部完成）
          let addedStreams = 0;
          for (const entry of parsed.entries) {
            if (classifyEntry(entry.url) !== 'stream') continue;
            // 歌单可能一次带很多条流：静默入库，最后只留一条汇总提示
            const r = await addStream(entry.url, { silent: true });
            if (r.ok) {
              streams += 1;
              addedStreams += 1;
            } else {
              streamFailed += 1;
            }
          }
          if (addedStreams > 0) appendLog(`PLAYLIST STREAM +${addedStreams}`);
          // 本地条目：命中曲库的收进一个新建的播放序列（有命中才创建）
          let playlistId: string | null = null;
          const added = new Set<string>();
          let fileMatched = 0;
          for (const entry of parsed.entries) {
            if (classifyEntry(entry.url) === 'stream') continue;
            const song = byName.get(baseNameOf(entry.url).toLowerCase());
            if (!song) {
              unmatched += 1;
              continue;
            }
            if (added.has(song.id)) continue;
            if (playlistId === null) {
              playlistId = createPlaylist(baseNameOf(file.name) || '导入歌单');
            }
            addToPlaylist(playlistId, song.id);
            added.add(song.id);
            matched += 1;
            fileMatched += 1;
          }
          if (fileMatched > 0) {
            appendLog(
              `PLAYLIST ${file.name} — ${fileMatched} TRACK${fileMatched === 1 ? '' : 'S'} MATCHED`,
              'trace',
            );
          }
        }
        appendLog(
          `PLAYLIST IMPORT: ${streams} STREAM / ${matched} MATCHED / ${unmatched} UNMATCHED`,
        );
        const parts: string[] = [];
        if (streams > 0) parts.push(`${streams} 条在线流`);
        if (matched > 0) parts.push(`${matched} 首匹配入库`);
        if (unmatched > 0) parts.push(`${unmatched} 条未匹配`);
        if (streamFailed > 0) parts.push(`${streamFailed} 条在线流无效`);
        if (ignored > 0) parts.push(`${ignored} 行已忽略`);
        if (parts.length === 0) {
          toast.info('歌单中没有可导入的条目');
        } else if (streams === 0 && matched === 0) {
          toast.info(`歌单导入：${parts.join('、')}`);
        } else {
          toast.success(`歌单导入：${parts.join('、')}`);
        }
      }
    },
    [addStream, addToPlaylist, appendLog, createPlaylist, songs, setSongs],
  );

  /** Read the same-directory sidecar lyric (.lrc/.txt) for a device song.
   *  Offline only — no network requests during a scan. Online matching is
   *  deferred to the lyrics panel where the user explicitly asks for it. */
  const matchDeviceLyricsLocal = useCallback((song: ISong) => {
    if (!song.devicePath) return;
    void (async () => {
      try {
        const r = await MediaScanner.getLyricsLocal({ path: song.devicePath });
        if (!r || !r.source || !r.lyrics) return;
        const updated = { ...song, lyrics: r.lyrics };
        await putSong(updated);
        setSongs((prev) => prev.map((s) => (s.id === song.id ? updated : s)));
      } catch {
        /* lyrics are best-effort */
      }
    })();
  }, [setSongs]);

  /** User-triggered online lyric match from the lyrics panel. Runs the native
   *  lookup on a background thread pool and writes the result through. */
  const fetchLyricsOnline = useCallback(
    async (songId: string) => {
      const song = songs.find((s) => s.id === songId);
      if (!song) return;
      if (!song.title) {
        toast.info('该歌曲缺少标题，无法联网匹配歌词');
        return;
      }
      toast.loading('正在联网匹配歌词…', { duration: 0 });
      try {
        const r = await MediaScanner.getLyricsOnline({
          title: song.title,
          artist: song.artist,
        });
        toast.dismiss();
        if (!r || !r.source || !r.lyrics) {
          toast.info('未找到匹配的在线歌词，可尝试导入 .lrc 文件');
          return;
        }
        const updated = { ...song, lyrics: r.lyrics };
        await putSong(updated);
        setSongs((prev) => prev.map((s) => (s.id === songId ? updated : s)));
        toast.success('已获取歌词');
      } catch {
        toast.dismiss();
        toast.error('联网获取歌词失败，请稍后重试');
      }
    },
    [songs, setSongs],
  );

  /** Import lyric text (from a user-picked .lrc/.txt file) for a song. */
  const importLyrics = useCallback(
    async (songId: string, content: string) => {
      const song = songs.find((s) => s.id === songId);
      if (!song) return;
      if (!content || !content.trim()) {
        toast.error('歌词文件内容为空');
        return;
      }
      const updated = { ...song, lyrics: content };
      await putSong(updated);
      setSongs((prev) => prev.map((s) => (s.id === songId ? updated : s)));
      toast.success('已导入歌词');
    },
    [songs, setSongs],
  );

  /** Scan the device MediaStore for audio and import new songs (native only).
   *  Songs already in the library (matched by device path) are skipped. */
  const scanDeviceSongs = useCallback(async () => {
    if (!isNative()) return { added: 0, skipped: 0, failed: 0, permissionDenied: false, error: '' };
    appendLog('SCAN DIR: /DEVICE/MEDIASTORE', 'trace');
    let list: DeviceSong[] = [];
    try {
      const res = await MediaScanner.scanAudio();
      list = res.songs || [];
    } catch (e) {
      const msg = (e as Error).message || '';
      if (msg.includes('PERM_DENIED')) {
        appendLog('SCAN FAILED — STORAGE PERMISSION DENIED', 'error');
        toast.error('存储权限被拒绝，无法扫描设备歌曲');
        return { added: 0, skipped: 0, failed: 1, permissionDenied: true, error: msg };
      }
      const detail = msg.replace(/^SCAN_ERR\|/, '').replace(/^扫描失败:\s*/, '');
      appendLog(`SCAN FAILED — ${detail || 'UNKNOWN ERROR'}`, 'error');
      toast.error(detail ? `扫描设备音频失败：${detail}` : '扫描设备音频失败');
      return { added: 0, skipped: 0, failed: 1, permissionDenied: false, error: detail };
    }
    appendLog(`SCAN OK — ${list.length} MEDIA FILE${list.length === 1 ? '' : 'S'} FOUND`);
    const existing = await getAllSongs();
    const knownPaths = new Set(existing.filter((s) => s.devicePath).map((s) => s.devicePath));
    let added = 0;
    let skipped = 0;
    for (const s of list) {
      if (!s.path || knownPaths.has(s.path)) {
        skipped += 1;
        continue;
      }
      const fileName = s.path.split('/').pop() || 'unknown';
      const song: ISong = {
        id: `device:${s.id}`,
        title: s.title || fileName.replace(/\.[^.]+$/, ''),
        artist: s.artist || '未知艺术家',
        album: s.album || '',
        duration: Math.round(s.duration / 1000),
        codec: formatCodec(s.mime || fileName.split('.').pop() || ''),
        sampleRate: 0,
        bitrate: 0,
        fileName,
        cover: null,
        audio: null,
        devicePath: s.path,
        deviceAlbumId: s.albumId > 0 ? s.albumId : undefined,
        addedAt: Date.now(),
      };
      try {
        await putSong(song);
        setSongs((prev) => [...prev, song]);
        added += 1;
        appendLog(`LOAD TRACK ${fileName} OK — ${song.codec}`, 'trace');
        // Offline sidecar lyric read only — online matching waits for the
        // lyrics panel where the user explicitly opts in.
        matchDeviceLyricsLocal(song);
      } catch {
        /* keep going */
      }
    }
    appendLog(`SCAN COMPLETE: ${added} ADDED / ${skipped} SKIPPED`);
    if (added > 0) {
      toast.success(`已从设备扫描并添加 ${added} 首歌曲（本地歌词已读取）`);
    } else if (skipped > 0) {
      toast.info(`设备歌曲已全部在介质库中（跳过 ${skipped} 首）`);
    } else {
      toast.info('设备中未发现可导入的音频');
    }
    return { added, skipped, failed: 0, permissionDenied: false, error: '' };
  }, [matchDeviceLyricsLocal, appendLog, setSongs]);

  return { importFiles, scanDeviceSongs, fetchLyricsOnline, importLyrics };
}
