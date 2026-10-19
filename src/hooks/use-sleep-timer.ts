import { useSyncExternalStore } from 'react';
import { getSleepTimer, subscribeSleepTimer, type SleepTimerState } from '@/lib/sleep-timer';

/** Reactive view of the in-memory sleep timer store. */
export function useSleepTimer(): SleepTimerState {
  return useSyncExternalStore(subscribeSleepTimer, getSleepTimer, getSleepTimer);
}
