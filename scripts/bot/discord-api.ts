// Discord API -- rate-limit-aware fetch

const DISCORD_FETCH_TIMEOUT_MS = 10_000; // 10s — prevents hung requests from blocking the bot

// ── Discord API stats tracking ───────────────────────────
let messagesSent = 0;
let rateLimitHits = 0;
let retriesUsed = 0;
let lastRateLimitTime = 0;
let lastRetryAfterMs = 0;
let statsDay = new Date().getUTCDate();

function resetDailyIfNeeded() {
  const today = new Date().getUTCDate();
  if (today !== statsDay) {
    messagesSent = 0;
    rateLimitHits = 0;
    retriesUsed = 0;
    statsDay = today;
  }
}

export function getDiscordStats() {
  resetDailyIfNeeded();
  return {
    messages_sent_today: messagesSent,
    rate_limits_today: rateLimitHits,
    retries_today: retriesUsed,
  };
}

export async function discordFetch(url: string, options: RequestInit = {}, retries = 2): Promise<Response> {
  resetDailyIfNeeded();
  // Track message sends (any POST to Discord API is an outbound request)
  if (options.method === "POST" || !options.method) messagesSent++;
  for (let attempt = 0; attempt < retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DISCORD_FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if (res.ok || res.status === 404) return res;

      if (res.status === 429) {
        rateLimitHits++;
        lastRateLimitTime = Date.now();
        const retryAfter = res.headers.get("Retry-After") ||
                           res.headers.get("X-RateLimit-Reset-After");
        const waitMs = retryAfter ? parseFloat(retryAfter) * 1000 : (attempt + 1) * 2000;
        lastRetryAfterMs = waitMs;
        if (attempt > 0) retriesUsed++;
        console.warn(`Discord 429 -- waiting ${waitMs}ms (attempt ${attempt + 1}/${retries})`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }

      if (res.status >= 500) {
        await new Promise(r => setTimeout(r, (attempt + 1) * 1000));
        continue;
      }

      return res;
    } catch (err: any) {
      clearTimeout(timer);
      if (attempt < retries - 1 && (err?.name === 'AbortError' || err?.message?.includes('fetch failed'))) {
        console.warn(`Discord fetch error, retrying (attempt ${attempt + 1}/${retries}): ${err.message || err}`);
        await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Discord API failed after ${retries} retries: ${url}`);
}
