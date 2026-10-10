import { useRef, useState } from 'react';
import { Link2, Loader2, Radio, Search } from 'lucide-react';
import { usePlayer } from '@/lib/player-context';
import { cn } from '@/lib/utils';
import {
  RADIO_ERROR_MESSAGE,
  searchStations,
  stationSubtitle,
  type RadioStation,
} from '@/lib/radio-browser';

type Mode = 'url' | 'radio';

/**
 * 播放流入口。
 *
 * 「在线地址」：播放用户自己粘贴的 http(s) 音频流。
 * 「网络电台」：在 radio-browser.info 的公开网络电台目录里搜索 → 点一下就播。
 *
 * 两条路径都只负责“播放用户选择的公开流”：本程序不内置任何音乐平台源，不搜索、
 * 不下载、不解密、不代理任何音乐资源。
 */
export default function StreamAddRow() {
  const { addStreamSong } = usePlayer();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('url');

  // 在线地址
  const [url, setUrl] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // 网络电台
  const [query, setQuery] = useState('');
  const [stations, setStations] = useState<RadioStation[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [radioErr, setRadioErr] = useState('');
  const [addingUrl, setAddingUrl] = useState('');
  const [rowErr, setRowErr] = useState<Record<string, string>>({});
  const searchSeq = useRef(0);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await addStreamSong(url);
      if (!res.ok) {
        setErr(res.reason || '添加失败');
        return;
      }
      setUrl('');
      setErr('');
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const runSearch = async () => {
    const q = query.trim();
    if (!q || searching) return;
    const seq = ++searchSeq.current;
    setSearching(true);
    setRadioErr('');
    setRowErr({});
    try {
      const list = await searchStations(q, { limit: 25 });
      if (seq !== searchSeq.current) return;
      setStations(list);
    } catch {
      if (seq !== searchSeq.current) return;
      setStations([]);
      setRadioErr(RADIO_ERROR_MESSAGE);
    } finally {
      if (seq === searchSeq.current) setSearching(false);
    }
  };

  const addStation = async (station: RadioStation) => {
    if (station.unsupported || addingUrl) return;
    setAddingUrl(station.url);
    setRowErr((prev) => ({ ...prev, [station.url]: '' }));
    try {
      const res = await addStreamSong(station.url);
      if (!res.ok) {
        setRowErr((prev) => ({ ...prev, [station.url]: res.reason || '添加失败' }));
      }
    } finally {
      setAddingUrl('');
    }
  };

  const toggle = () => {
    setOpen((v) => !v);
    setErr('');
    setRadioErr('');
    setRowErr({});
  };

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className={cn(
          'flex items-center justify-center gap-1.5 border px-2.5 py-2 font-mono text-[10px] tracking-[0.18em] transition-colors',
          open
            ? 'border-primary/60 text-primary'
            : 'border-border/80 bg-card/70 text-muted-foreground hover:border-primary/50 hover:text-primary',
        )}
      >
        <Link2 className="h-3.5 w-3.5" />
        在线地址（流媒体）
      </button>

      {open && (
        <div className="flex flex-col gap-1.5 border border-border/70 bg-card/60 px-2.5 py-2">
          <div className="flex items-center gap-1.5">
            {(
              [
                { id: 'url' as Mode, label: '在线地址', Icon: Link2 },
                { id: 'radio' as Mode, label: '网络电台', Icon: Radio },
              ]
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setMode(id);
                  setErr('');
                  setRadioErr('');
                  setRowErr({});
                }}
                aria-pressed={mode === id}
                className={cn(
                  'clip-corner-sm flex items-center gap-1 border px-2 py-1 font-mono text-[10px] tracking-[0.18em] transition-colors',
                  mode === id
                    ? 'border-primary/60 text-primary'
                    : 'border-border/80 text-muted-foreground hover:border-primary/50 hover:text-primary',
                )}
              >
                <Icon className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>

          {mode === 'url' ? (
            <>
              <div className="flex items-center gap-1.5">
                <input
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setErr('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void submit();
                  }}
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="粘贴音频流地址（http/https，单个音频文件直链）…"
                  aria-label="在线音频流地址"
                  className="clip-corner-sm min-w-0 flex-1 border border-border bg-secondary px-2.5 py-1.5 font-mono text-[11px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={busy || !url.trim()}
                  className="clip-corner-sm flex h-8 shrink-0 items-center gap-1 bg-primary px-3 font-mono text-[10px] tracking-widest text-primary-foreground disabled:opacity-40"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  添加
                </button>
              </div>

              {err && (
                <p className="font-mono text-[9px] leading-relaxed tracking-wider text-destructive">
                  ⚠ {err}
                </p>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void runSearch();
                  }}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="搜索公开电台（如 jazz / 中国 / news）…"
                  aria-label="网络电台搜索关键词"
                  className="clip-corner-sm min-w-0 flex-1 border border-border bg-secondary px-2.5 py-1.5 font-mono text-[11px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => void runSearch()}
                  disabled={searching || !query.trim()}
                  className="clip-corner-sm flex h-8 shrink-0 items-center gap-1 bg-primary px-3 font-mono text-[10px] tracking-widest text-primary-foreground disabled:opacity-40"
                >
                  {searching ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Search className="h-3.5 w-3.5" />
                  )}
                  搜索
                </button>
              </div>

              {radioErr && (
                <p className="font-mono text-[9px] leading-relaxed tracking-wider text-destructive">
                  ⚠ {radioErr}
                </p>
              )}

              {!radioErr && stations !== null && stations.length === 0 && !searching && (
                <p className="font-mono text-[9px] leading-relaxed tracking-wider text-muted-foreground/80">
                  没找到电台，换个关键词试试
                </p>
              )}

              {stations !== null && stations.length > 0 && (
                <ul className="max-h-[40vh] overflow-y-auto divide-y divide-border/60 border border-border/60">
                  {stations.map((station) => {
                    const rowMessage = rowErr[station.url];
                    return (
                      <li
                        key={`${station.id}:${station.url}`}
                        className="flex items-center gap-2 px-2 py-1.5"
                      >
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-mono text-[11px] text-foreground">
                            {station.name}
                          </span>
                          <span className="truncate font-mono text-[9px] tracking-wider text-muted-foreground/80">
                            {station.unsupported ? '不支持 HLS' : stationSubtitle(station)}
                          </span>
                          {rowMessage && (
                            <span className="truncate font-mono text-[9px] tracking-wider text-destructive">
                              ⚠ {rowMessage}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => void addStation(station)}
                          disabled={station.unsupported || addingUrl === station.url}
                          title={station.unsupported ? '不支持 HLS' : undefined}
                          className="clip-corner-sm flex h-7 shrink-0 items-center gap-1 border border-primary/50 px-2 font-mono text-[10px] tracking-widest text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:border-border/60 disabled:text-muted-foreground/60 disabled:hover:bg-transparent disabled:hover:text-muted-foreground/60"
                        >
                          {addingUrl === station.url ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : null}
                          {station.unsupported ? '不支持 HLS' : '添加'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}

          <p className="font-mono text-[9px] leading-relaxed tracking-wider text-muted-foreground/80">
            仅播放你自己提供的公开音频流：本程序不内置任何音乐资源，不提供搜索、下载、解密或代理接口，
            请自行确保来源合法。不支持 m3u8（HLS）直播流。
          </p>

          {mode === 'radio' && (
            <p className="font-mono text-[9px] leading-relaxed tracking-wider text-muted-foreground/80">
              电台目录来自 radio-browser.info 的公开数据，本程序只播放你选择的公开流，不提供、不内置任何音乐资源。
            </p>
          )}
        </div>
      )}
    </div>
  );
}
