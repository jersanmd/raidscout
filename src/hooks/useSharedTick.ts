// One interval for every countdown on the page.
//
// The auction list can show 155 rows; giving each row its own setInterval and
// re-rendering the whole row every second is where client CPU went during big
// wars. All consumers here share a single 1 s interval, and — because
// useSyncExternalStore only re-renders when the snapshot value changes — a
// component that derives a boolean (useEnded) re-renders exactly once, at the
// moment the boolean flips.

import { useSyncExternalStore } from "react";

let now = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Current time, updated once per second, floored to the second so the snapshot
 *  is stable within a tick. Re-renders the caller every second. */
export function useNowSec(): number {
  return useSyncExternalStore(subscribe, () => Math.floor(now / 1000) * 1000);
}

/** Whether `endTime` has passed. Re-renders the caller only when the answer
 *  changes — i.e. once, when the countdown crosses zero. */
export function useEnded(endTime: string | null): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (endTime ? now >= new Date(endTime).getTime() : false),
  );
}
