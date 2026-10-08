/**
 * Terminal behavior config (ENDFIELD OS 系统配置 → 终端行为).
 * Persisted in localStorage; the shell subscribes to changes so toggles
 * (scanlines, beep, idle) take effect immediately without a restart.
 */

export type LogLevel = 'trace' | 'info' | 'warn' | 'error';

export interface TerminalConfig {
  /** animated background scanlines */
  scanlinesOn: boolean;
  /** scanline scroll speed in seconds per cycle */
  scanSpeed: number;
  /** short beep on dock / control taps */
  beepOn: boolean;
  /** dim the shell after N idle minutes; 0 = never */
  idleMinutes: number;
  /** toast verbosity floor */
  logLevel: LogLevel;
}

const KEY = 'endfield-player:terminal-config';

export const DEFAULT_CONFIG: TerminalConfig = {
  scanlinesOn: true,
  scanSpeed: 9,
  beepOn: false,
  idleMinutes: 0,
  logLevel: 'info',
};

type Listener = () => void;

let listeners: Listener[] = [];
let snapshot: TerminalConfig | null = null;

function readConfig(): TerminalConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const p = JSON.parse(raw) as Partial<TerminalConfig>;
    return {
      scanlinesOn: typeof p.scanlinesOn === 'boolean' ? p.scanlinesOn : DEFAULT_CONFIG.scanlinesOn,
      scanSpeed: typeof p.scanSpeed === 'number' ? Math.min(24, Math.max(4, p.scanSpeed)) : DEFAULT_CONFIG.scanSpeed,
      beepOn: typeof p.beepOn === 'boolean' ? p.beepOn : DEFAULT_CONFIG.beepOn,
      idleMinutes: typeof p.idleMinutes === 'number' ? Math.min(60, Math.max(0, p.idleMinutes)) : DEFAULT_CONFIG.idleMinutes,
      logLevel: ['trace', 'info', 'warn', 'error'].includes(p.logLevel ?? '')
        ? (p.logLevel as LogLevel)
        : DEFAULT_CONFIG.logLevel,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function getTerminalConfig(): TerminalConfig {
  return readConfig();
}

/** Cached read for useSyncExternalStore — stable reference between writes. */
export function getConfigSnapshot(): TerminalConfig {
  if (!snapshot) snapshot = readConfig();
  return snapshot;
}

export function subscribeTerminalConfig(listener: Listener): () => void {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export function setTerminalConfig(cfg: TerminalConfig) {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg));
  } catch {
    /* storage unavailable */
  }
  snapshot = cfg;
  for (const l of listeners) l();
}

const LEVEL_RANK: Record<LogLevel, number> = { trace: 0, info: 1, warn: 2, error: 3 };

/** true when a terminal log line of the given level should reach the toast. */
export function shouldLog(level: LogLevel, cfg: TerminalConfig = getConfigSnapshot()): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[cfg.logLevel];
}
