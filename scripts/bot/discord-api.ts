// Discord API -- rate-limit-aware fetch

const DISCORD_FETCH_TIMEOUT_MS = 20_000; // 20s — prevents hung requests from blocking the bot

export async function discordFetch(url: string, options: RequestInit = {}, retries = 3): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DISCORD_FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if (res.ok || res.status === 404) return res;

      if (res.status === 429) {
        const retryAfter = res.headers.get("Retry-After") ||
                           res.headers.get("X-RateLimit-Reset-After");
        const waitMs = retryAfter ? parseFloat(retryAfter) * 1000 : (attempt + 1) * 2000;
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
