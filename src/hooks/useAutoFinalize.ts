import { useEffect, useRef } from "react";

const AUTO_FINALIZE_PREFIX = "lordnine-auto-finalize-monday";

/** Returns the Monday 00:00 local for a given date */
export function getMondayISO(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function getLastAutoFinalize(serverId: string | null): string | null {
  if (!serverId) return null;
  return localStorage.getItem(`${AUTO_FINALIZE_PREFIX}-${serverId}`);
}

export function setLastAutoFinalize(serverId: string | null, date: string): void {
  if (!serverId) return;
  localStorage.setItem(`${AUTO_FINALIZE_PREFIX}-${serverId}`, date);
}

/**
 * Returns true if we've crossed a Monday boundary since the last auto-finalize.
 * Only triggers if we actually started on a previous Monday (has a stored value).
 */
export function shouldAutoFinalize(serverId: string | null): boolean {
  if (!serverId) return false;
  const thisMonday = getMondayISO(new Date());
  const last = getLastAutoFinalize(serverId);
  return last !== null && last !== thisMonday;
}
