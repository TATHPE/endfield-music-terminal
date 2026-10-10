// EXPORTS: PlaylistEntry, ParsedPlaylist, isPlaylistFileName, parsePlaylistFile,
//          classifyEntry, baseNameOf
/**
 * 歌单文件（.m3u / .m3u8 / .pls）解析 —— 纯函数，便于单测。
 *
 * 只做“文本 → 条目”的解析，不碰文件系统、不联网、不读曲库：条目是本地路径
 * 还是在线地址由 classifyEntry 判定，交给调用方决定后续处理。
 */

/** 歌单里的一条目录项。 */
export interface PlaylistEntry {
  /** 原始地址：http(s) 直链、本地路径、相对路径或 file: 路径 */
  url: string;
  /** #EXTINF / TitleN 提供的标题（缺省时由调用方从地址推导） */
  title?: string;
  /** 秒；缺省或不可用时为 undefined */
  duration?: number;
}

export interface ParsedPlaylist {
  entries: PlaylistEntry[];
  /** 无法转成条目的行数（注释与空行不算，见下） */
  skipped: number;
}

/** 歌单文件扩展名：.m3u / .m3u8 / .pls */
const PLAYLIST_NAME = /\.(m3u8?|pls)$/i;
const PLS_NAME = /\.pls$/i;

/**
 * 控制字符 / 替换字符 U+FFFD：用错误的编码打开歌单时，损坏行会长成一串
 * 控制字节或锟斤拷。tab 属于正常空白，不算损坏。
 *
 * 这里按字符码逐字判断而不是写控制字符正则：`[\u0000-\u001F]` 这类字符类会
 * 触发 eslint 的 no-control-regex，而本函数语义更直白、也无需禁用规则。
 */
function isGarbledLine(line: string): boolean {
  for (const ch of line) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 0xfffd) return true;
    if (code === 0x7f) return true;
    if (code < 0x20 && ch !== '\t') return true;
  }
  return false;
}

/** `#EXTINF:<秒数>,<标题>` —— 标题可缺省，秒数可为 -1（未知）。 */
const EXTINF = /^#EXTINF\s*:\s*(-?\d+(?:\.\d+)?)\s*(?:,(.*))?$/i;

/** pls 的 `FileN` / `TitleN` / `LengthN` 键。 */
const PLS_KEY = /^(file|title|length)(\d+)$/i;
/** pls 的头部键：合法但没有条目价值，静默忽略。 */
const PLS_META_KEY = /^(numberofentries|version)$/i;

/** 文件名（可能带路径）是否是歌单文件。 */
export function isPlaylistFileName(name: string): boolean {
  return PLAYLIST_NAME.test((name || '').trim());
}

/** `http(s)://` 视为在线流，其余（本地 / 相对路径 / file:）视为本地条目。 */
export function classifyEntry(url: string): 'stream' | 'local' {
  return /^https?:\/\//i.test((url || '').trim()) ? 'stream' : 'local';
}

/**
 * 取出文件名：去掉目录、URL query/fragment、百分号编码与扩展名。
 * 用于把歌单条目和曲库里的歌名 / 文件名做比对，因此两侧都走这里，
 * 大小写由调用方归一。
 */
export function baseNameOf(urlOrPath: string): string {
  let value = (urlOrPath || '').trim();
  if (!value) return '';
  const cut = value.search(/[?#]/);
  if (cut >= 0) value = value.slice(0, cut);
  value = value.replace(/\\/g, '/');
  const last = value.split('/').filter(Boolean).pop() ?? '';
  let decoded = last;
  try {
    decoded = decodeURIComponent(last);
  } catch {
    /* 非法百分号序列：保留原文 */
  }
  // 只把「像扩展名」的短后缀去掉（1–5 位字母数字），避免把
  // “Mr. Blue Sky” 这类含点的标题截断。
  const trimmed = decoded.replace(/\.[A-Za-z0-9]{1,5}$/, '').trim();
  return trimmed || decoded.trim();
}

/**
 * 解析一个歌单文件的内容。
 *
 * - m3u/m3u8：`#EXTM3U`、空行、`#` 注释行直接跳过（不计入 skipped）；
 *   `#EXTINF:<秒数>,<标题>` 为**下一行**提供 title/duration；其余非 `#` 行
 *   即地址。含控制字节/替换字符的损坏行计入 skipped，并清掉待用的 EXTINF。
 * - pls：按 `FileN` / `TitleN` / `LengthN` 的 N 配对，条目按 N 升序输出
 *   （乱序编号也能正确配对）；`[playlist]` 段头、`NumberOfEntries` / `Version`
 *   与注释静默跳过；无法识别的键、空的 FileN、非法的 LengthN 各计入 skipped；
 *   只有 Title/Length 而没有 File 的编号也计入 skipped。
 * - 兼容 CRLF / LF / 单独 CR、行首尾空白与 BOM。
 * - 传入非歌单文件名时不做任何解析，返回空结果。
 */
export function parsePlaylistFile(fileName: string, text: string): ParsedPlaylist {
  if (!isPlaylistFileName(fileName)) return { entries: [], skipped: 0 };
  const body = (text ?? '').replace(/^\uFEFF/, '');
  const lines = body.split(/\r\n|\r|\n/);
  return PLS_NAME.test(fileName.trim()) ? parsePls(lines) : parseM3u(lines);
}

function parseM3u(lines: string[]): ParsedPlaylist {
  const entries: PlaylistEntry[] = [];
  let skipped = 0;
  let pending: { title?: string; duration?: number } | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue; // 空行
    if (line.startsWith('#')) {
      // #EXTM3U、#EXTINF 及其他指令 / 注释行
      const meta = parseExtInf(line);
      if (meta) pending = meta;
      continue;
    }
    if (isGarbledLine(line)) {
      skipped += 1;
      pending = null;
      continue;
    }
    entries.push(pending ? { url: line, ...pending } : { url: line });
    pending = null;
  }
  return { entries, skipped };
}

function parseExtInf(line: string): { title?: string; duration?: number } | null {
  const m = EXTINF.exec(line);
  if (!m) return null;
  const meta: { title?: string; duration?: number } = {};
  const seconds = Number(m[1]);
  // -1 / 0 表示时长未知：不写 duration，而不是写一个假的 0。
  if (Number.isFinite(seconds) && seconds > 0) meta.duration = seconds;
  const title = (m[2] ?? '').trim();
  if (title) meta.title = title;
  return meta;
}

interface PlsSlot {
  file?: string;
  title?: string;
  length?: number;
}

function parsePls(lines: string[]): ParsedPlaylist {
  const slots = new Map<number, PlsSlot>();
  let skipped = 0;
  const slotOf = (n: number): PlsSlot => {
    let slot = slots.get(n);
    if (!slot) {
      slot = {};
      slots.set(n, slot);
    }
    return slot;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^\[.*\]$/.test(line)) continue; // [playlist] 段头
    if (line.startsWith('#') || line.startsWith(';')) continue; // 注释
    if (isGarbledLine(line)) {
      skipped += 1;
      continue;
    }
    const eq = line.indexOf('=');
    if (eq < 0) {
      skipped += 1;
      continue;
    }
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (PLS_META_KEY.test(key)) continue;
    const m = PLS_KEY.exec(key);
    if (!m) {
      skipped += 1;
      continue;
    }
    const kind = m[1].toLowerCase();
    const slot = slotOf(Number(m[2]));
    if (kind === 'file') {
      if (value) slot.file = value;
      else skipped += 1;
    } else if (kind === 'title') {
      if (value) slot.title = value;
    } else {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds > 0) slot.length = seconds;
      else skipped += 1;
    }
  }

  const entries: PlaylistEntry[] = [];
  for (const n of [...slots.keys()].sort((a, b) => a - b)) {
    const slot = slots.get(n) as PlsSlot;
    if (!slot.file) {
      // 只有 Title/Length 的孤儿编号：元数据有效但无地址可用。
      if (slot.title !== undefined || slot.length !== undefined) skipped += 1;
      continue;
    }
    const entry: PlaylistEntry = { url: slot.file };
    if (slot.title) entry.title = slot.title;
    if (slot.length) entry.duration = slot.length;
    entries.push(entry);
  }
  return { entries, skipped };
}
