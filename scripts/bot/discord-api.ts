// @ts-nocheck
// Discord API -- rate-limit-aware fetch

export async function discordFetch(url: string, options: RequestInit = {}, retries = 3): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(url, options);
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
  }
  throw new Error(`Discord API failed after ${retries} retries: ${url}`);
}
