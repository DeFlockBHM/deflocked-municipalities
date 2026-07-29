import { sleep } from "./concurrency.js";

const UA = "deflocked-municipalities-bot/1.0 (+https://github.com/DeFlockBHM/deflocked-municipalities)";
const SAVE_TIMEOUT_MS = 20_000;
const RETRY_DELAYS_MS = [3000];

async function attemptSave(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SAVE_TIMEOUT_MS);
  try {
    const res = await fetch(`https://web.archive.org/save/${encodeURI(url)}`, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": UA },
      signal: controller.signal,
    });
    const location = res.headers.get("content-location");
    if (location) {
      return `https://web.archive.org${location}`;
    }
    if (res.url && res.url.includes("web.archive.org/web/")) {
      return res.url;
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Snapshots `url` via the Wayback Machine Save API and returns the resulting
// archive URL, or null if the save couldn't be confirmed after retries
// (caller should keep whatever archive_url it already had and retry on a
// later run - the Save API rate-limits bursts hard, so misses are expected
// and not treated as fatal).
export async function archiveUrl(url) {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const result = await attemptSave(url);
    if (result) return result;
    if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
  }
  return null;
}
