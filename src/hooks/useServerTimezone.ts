import { useServer } from "@/contexts/ServerContext";

/** Returns the current server's timezone, defaulting to Asia/Manila */
export function useServerTimezone(): string {
  const { currentServer } = useServer();
  return currentServer?.timezone || "Asia/Manila";
}

/** Format a date in the server's timezone */
export function formatInTimezone(date: Date | string, timezone: string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    ...options,
  }).format(new Date(date));
}
