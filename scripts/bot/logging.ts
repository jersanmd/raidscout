// @ts-nocheck
// Logging -- circular buffer + console override

export const LOG_BUFFER: { ts: string; level: string; msg: string }[] = [];
const MAX_LOG_BUFFER = 200;

export function bufferLog(level: string, ...args: any[]) {
  const msg = args.map(a => typeof a === "string" ? a : JSON.stringify(a)).join(" ");
  LOG_BUFFER.push({ ts: new Date().toISOString(), level, msg });
  if (LOG_BUFFER.length > MAX_LOG_BUFFER) LOG_BUFFER.shift();
}

export function installLogging() {
  const _log = console.log, _warn = console.warn, _error = console.error;
  console.log = (...a: any[]) => { bufferLog("info", ...a); _log.apply(console, a); };
  console.warn = (...a: any[]) => { bufferLog("warn", ...a); _warn.apply(console, a); };
  console.error = (...a: any[]) => { bufferLog("error", ...a); _error.apply(console, a); };
}
