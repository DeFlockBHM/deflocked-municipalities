const CMS_URL = "https://cms.deflock.me/items/flockWins?limit=-1";
const UA = "deflocked-municipalities-bot/1.0 (+https://github.com/DeFlockBHM/deflocked-municipalities)";

// The public deflock.org/council page is a client-rendered SPA; it fetches
// this Directus collection directly and renders the table from it. We call
// the same endpoint rather than scraping rendered HTML.
export async function fetchSourceRows() {
  const res = await fetch(CMS_URL, { headers: { "User-Agent": UA } });
  if (!res.ok) {
    throw new Error(`Failed to fetch source data: HTTP ${res.status}`);
  }
  const body = await res.json();
  if (!Array.isArray(body.data)) {
    throw new Error("Unexpected response shape from flockWins endpoint");
  }
  return body.data;
}
