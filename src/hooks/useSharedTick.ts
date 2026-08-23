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

// ── Server-corrected clock (DKP countdowns) ─────────────────
//
// place_bid enforces deadlines on the database clock; a device clock running
// 10-20s behind renders a countdown for time that does not exist, and the
// player's bid dies with AUCTION_CLOSED at "9 seconds left". The hooks below
// render server time instead, built from an offset (serverNow - deviceNow):
//
//   * An RPC sample (get_server_time) is authoritative and RESETS the offset —
//     it survives a device clock being step-corrected mid-session.
//   * Broadcast `ts` samples may only RAISE it. Every sample source
//     underestimates the true offset (RPC by return latency, events by
//     delivery latency), and underestimating shows the player MORE time than
//     exists — so between samples, the max is both closest to truth and the
//     conservative choice.
//
// DEADLINE_SAFETY_MS leans the residual error the safe way: remaining time is
// computed in exactly ONE place (serverRemainingMs) with a 1s pessimistic
// margin, so the countdown, progress bar, ended flip, bid button, theater and
// modal can never disagree — and can never re-invite this bug. Boss timers
// intentionally keep the uncorrected hooks above: nothing server-side refuses
// an action at their deadlines.

const DEADLINE_SAFETY_MS = 1000;

let serverOffsetMs = 0;

/** Feed one server-time sample (ms since epoch). `authoritative` = an RPC
 *  sample: resets the baseline. Non-authoritative (broadcast ts): only raises. */
export function applyServerClockSample(serverTsMs: number, authoritative: boolean): void {
  if (!Number.isFinite(serverTsMs)) return;
  const sample = serverTsMs - Date.now();
  serverOffsetMs = authoritative ? sample : Math.max(serverOffsetMs, sample);
  // Wake subscribers so a corrected countdown shows up now, not next tick.
  now = Date.now();
  listeners.forEach((l) => l());
}

/** Current server time in ms (device clock + learned offset). */
export function serverNow(): number {
  return Date.now() + serverOffsetMs;
}

/** Milliseconds of bidding actually left, with the pessimistic margin applied.
 *  THE single place remaining time is computed. `serverNowMs` is server-
 *  corrected time (defaults to serverNow()). */
export function serverRemainingMs(endTime: string | null, serverNowMs: number = serverNow()): number {
  if (!endTime) return 0;
  return Math.max(0, new Date(endTime).getTime() - serverNowMs - DEADLINE_SAFETY_MS);
}

/** Server-corrected once-per-second timestamp. */
export function useServerNowSec(): number {
  return useSyncExternalStore(subscribe, () => Math.floor((now + serverOffsetMs) / 1000) * 1000);
}

/** Server-corrected "has bidding ended" — re-renders only when the answer flips. */
export function useServerEnded(endTime: string | null): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (endTime ? serverRemainingMs(endTime, now + serverOffsetMs) <= 0 : false),
  );
}
