import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
import { decodeEntities } from "./htmlUtils.js";

chromium.use(stealth());

export const SOURCE_URL =
  "https://ij.org/institute-for-justice-unveils-new-database-tracking-cancelations-of-license-plate-reader-contracts/";
const SOURCE_NAME = "Institute for Justice - ALPR Camera Contract Cancelations";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

// IJ's cancellation database sits behind a Cloudflare JS challenge, so we
// can't just fetch the HTML - we have to run a real (stealth-patched)
// browser, let the challenge clear, and read the client-rendered DOM.
async function fetchRenderedHtml() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ userAgent: UA });
    await page.goto(SOURCE_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector(".alpr-incident-tracker__incident", { timeout: 30_000 });
    await page.waitForTimeout(1500);
    return await page.content();
  } finally {
    await browser.close();
  }
}

// The tracker is a WordPress ACF block that renders one
// <article class="alpr-incident-tracker__incident" data-*> per row, plus an
// inner description paragraph and "Original source" link. Same component IJ
// uses for their ALPR abuse database - see flock-misuse-tracker for prior art.
function parseRows(html) {
  const chunks = html.split('<article class="alpr-incident-tracker__incident"').slice(1);
  return chunks.map((chunk) => {
    const attr = (name) => {
      const m = chunk.match(new RegExp(`data-${name}="([^"]*)"`));
      return m ? decodeEntities(m[1]) : null;
    };
    const descMatch = chunk.match(/alpr-incident-tracker__description"><p>([\s\S]*?)<\/p>/);
    const sourceMatch = chunk.match(/alpr-incident-tracker__source"\s+href="([^"]+)"/);
    return {
      ij_source_id: attr("alpr-incident"),
      title: attr("title"),
      city: attr("location"),
      state_slug: attr("state"),
      state_name: attr("state-name"),
      type_slug: attr("type"),
      type_name: attr("type-name"),
      manufacturer_slug: attr("manufacturer"),
      manufacturer_name: attr("manufacturer-name"),
      date_iso: attr("date"),
      description: descMatch
        ? decodeEntities(descMatch[1].replace(/<[^>]+>/g, "").trim())
        : "",
      source_url: sourceMatch ? decodeEntities(sourceMatch[1]) : null,
    };
  });
}

export async function fetchSourceRows() {
  const html = await fetchRenderedHtml();
  const rows = parseRows(html);
  if (rows.length === 0) {
    throw new Error("Parsed zero rows from IJ's cancellation tracker - source markup may have changed");
  }
  return rows;
}

export { SOURCE_NAME };
