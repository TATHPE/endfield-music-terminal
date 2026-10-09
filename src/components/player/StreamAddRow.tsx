import { useState } from 'react';
import { Link2, Loader2 } from 'lucide-react';
import { usePlayer } from '@/lib/player-context';
import { cn } from '@/lib/utils';

/**
 * 在线地址（流媒体）入口。
 *
 * 播放器只负责播放用户自己提供的 http(s) 音频流：不内置任何平台源，不搜索、不下载、
 * 不解密、不代理。地址保存在本机介质库里，可随时删除。
 */
export default function StreamAddRow() {
  const { addStreamSong } = usePlayer();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

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

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setErr('');
        }}
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
            <p className="font-mono text-[9px] leading-relaxed tracking-wider text-destructive">⚠ {err}</p>
          )}

          <p className="font-mono text-[9px] leading-relaxed tracking-wider text-muted-foreground/80">
            仅播放你自己提供的公开音频流：本程序不内置任何音乐资源，不提供搜索、下载、解密或代理接口，
            请自行确保来源合法。不支持 m3u8（HLS）直播流。
          </p>
        </div>
      )}
    </div>
  );
}
