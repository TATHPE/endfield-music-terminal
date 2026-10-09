import { useSyncExternalStore } from 'react';

/**
 * Storage usage lives outside React (browser API), so it is exposed through
 * useSyncExternalStore: the effect-free pattern React recommends for external
 * data, and the one the hooks lint rules expect.
 */
export interface StorageUsage {
  used: number;
  quota: number;
  persisted: boolean;
}

/** undefined = not read yet, null = unavailable */
let snapshot: StorageUsage | null | undefined;
const listeners = new Set<() => void>();
let inflight = false;

function emit() {
  for (const listener of listeners) listener();
}

async function read() {
  if (inflight || typeof navigator === 'undefined' || !navigator.storage?.estimate) return;
  inflight = true;
  try {
    const est = await navigator.storage.estimate();
    const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
    snapshot = { used: est.usage ?? 0, quota: est.quota ?? 0, persisted };
  } catch {
    snapshot = null;
  } finally {
    inflight = false;
    emit();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // First consumer triggers a read; later ones reuse the cached snapshot.
  if (snapshot === undefined) void read();
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): StorageUsage | null | undefined {
  return snapshot;
}

export function useStorageUsage(): StorageUsage | null | undefined {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Re-read the estimate (call after imports, or after clearing data). */
export function refreshStorageUsage() {
  snapshot = undefined;
  emit();
  void read();
}
