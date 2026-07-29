import * as cheerio from "cheerio";

const UA = "Mozilla/5.0 (compatible; deflocked-municipalities-bot/1.0; +https://github.com/DeFlockBHM/deflocked-municipalities)";
const FETCH_TIMEOUT_MS = 20_000;
const MAX_EXCERPT_LENGTH = 400;

const PAYWALL_PATTERNS = [
  /subscribe (now |today )?to (continue|read)/i,
  /this (article|content) is (reserved|available) for subscribers/i,
  /you('re| are) out of free articles/i,
  /create a free account to continue reading/i,
  /already a subscriber\?\s*log in/i,
];

function truncateToSentence(text, maxLength) {
  if (text.length <= maxLength) return text;
  const slice = text.slice(0, maxLength);
  const lastStop = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "));
  if (lastStop > maxLength * 0.4) return slice.slice(0, lastStop + 1);
  return `${slice.trim()}…`;
}

function extractExcerpt($) {
  const metaDescription =
    $('meta[name="description"]').attr("content") ||
    $('meta[property="og:description"]').attr("content");
  if (metaDescription && metaDescription.trim().length > 20) {
    return truncateToSentence(metaDescription.trim(), MAX_EXCERPT_LENGTH);
  }
  const firstParagraph = $("article p, main p, p")
    .toArray()
    .map((el) => $(el).text().trim())
    .find((text) => text.length > 60);
  if (firstParagraph) {
    return truncateToSentence(firstParagraph, MAX_EXCERPT_LENGTH);
  }
  return null;
}

// Fetches the linked news article and pulls a short (1-3 sentence) excerpt.
// Never stores full article text: see SCHEMA.md on copyright exposure.
export async function fetchArticle(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      redirect: "follow",
      signal: controller.signal,
    });
    if (res.status === 404) {
      return { status: "404", excerpt: null };
    }
    if (res.status === 403 || res.status === 999 || res.status === 451) {
      return { status: "blocked", excerpt: null };
    }
    if (!res.ok) {
      return { status: "blocked", excerpt: null };
    }
    const html = await res.text();
    const $ = cheerio.load(html);
    const bodyText = $("body").text().slice(0, 4000);
    const excerpt = extractExcerpt($);
    if (PAYWALL_PATTERNS.some((re) => re.test(bodyText))) {
      return { status: "paywalled", excerpt };
    }
    return { status: "ok", excerpt };
  } catch {
    return { status: "blocked", excerpt: null };
  } finally {
    clearTimeout(timeout);
  }
}
