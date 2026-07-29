import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchSourceRows } from "./src/fetchSource.js";
import { buildShell, assignIds } from "./src/normalize.js";
import { parseMonthYear } from "./src/parseDate.js";
import { fetchArticle } from "./src/article.js";
import { archiveUrl } from "./src/wayback.js";
import { mapLimit, sleep } from "./src/concurrency.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, "..", "data", "municipalities.json");
const SOURCE_URL = "https://deflock.org/council#wins";
const SCHEMA_VERSION = 1;
const ARTICLE_CONCURRENCY = 4;
// The Wayback Save API rate-limits bursts hard (concurrent/rapid requests
// come back as 520s) and can be slow even when it succeeds, so archiving
// runs strictly serially, paced, and bounded by a hard wall-clock budget -
// per-URL retries make individual attempts unpredictable in duration, so a
// count-based cap alone isn't a reliable ceiling on total run time. Any
// backlog left after the budget runs out is picked up on the next daily run.
const WAYBACK_DELAY_MS = 1500;
const ARCHIVE_TIME_BUDGET_MS = 3 * 60 * 1000;

async function loadPrevious() {
  try {
    const raw = await readFile(DATA_PATH, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

function buildShells(rawRows) {
  // Display order on the site is newest-first by month/year; source_order
  // reflects that, purely for human reference (not used as identity).
  const displayOrder = [...rawRows].sort(
    (a, b) => parseMonthYear(b.monthYear).iso.localeCompare(parseMonthYear(a.monthYear).iso),
  );
  const shells = displayOrder.map((row, i) => buildShell(row, i + 1));
  return assignIds(shells);
}

async function enrichEntry(shell, prevEntry, now) {
  const needsArticleFetch =
    !prevEntry || prevEntry.content_hash !== shell.content_hash || prevEntry.article_fetch?.status === "blocked";

  const base = {
    id: shell.id,
    source_order: shell.source_order,
    location: shell.location,
    date: shell.date,
    status: shell.status,
    status_raw: shell.status_raw,
    info: shell.info,
    source_url: shell.source_url,
    link_domain: shell.link_domain,
    content_hash: shell.content_hash,
    first_seen_at: prevEntry?.first_seen_at ?? now,
    last_seen_at: now,
    verified: prevEntry?.verified ?? false,
    notes: prevEntry?.notes ?? "",
    // archive_url is filled in later by archiveMissing(), which paces
    // requests to the Wayback Save API across the whole entry set.
    archive_url: prevEntry?.archive_url ?? null,
  };

  if (!needsArticleFetch) {
    return {
      ...base,
      article_excerpt: prevEntry.article_excerpt,
      article_fetch: prevEntry.article_fetch,
    };
  }

  const article = await fetchArticle(shell.source_url);
  return {
    ...base,
    article_excerpt: article.excerpt,
    article_fetch: { fetched_at: now, status: article.status },
  };
}

// Archives entries missing an archive_url, serially and paced, within a hard
// wall-clock budget so a large backlog doesn't turn one run into an
// hours-long slog. Mutates entries in place.
async function archiveMissing(entries) {
  const candidates = entries.filter((e) => !e.archive_url);
  const deadline = Date.now() + ARCHIVE_TIME_BUDGET_MS;
  let attempted = 0;
  for (const entry of candidates) {
    if (Date.now() >= deadline) break;
    entry.archive_url = await archiveUrl(entry.source_url);
    attempted++;
    await sleep(WAYBACK_DELAY_MS);
  }
  console.log(
    `Archiving: attempted ${attempted}/${candidates.length} missing archive_url(s) within budget.`,
  );
}

function carryOverMissing(prevEntries, currentIds, now) {
  const missing = [];
  for (const prev of prevEntries) {
    if (currentIds.has(prev.id)) continue;
    missing.push({
      ...prev,
      flagged_missing: true,
      missing_since: prev.missing_since ?? now,
    });
  }
  return missing;
}

async function main() {
  const now = new Date().toISOString();
  const previous = await loadPrevious();
  const prevById = new Map((previous?.entries ?? []).map((e) => [e.id, e]));

  const rawRows = await fetchSourceRows();
  const shells = buildShells(rawRows);
  const currentIds = new Set(shells.map((s) => s.id));

  const enriched = await mapLimit(shells, ARTICLE_CONCURRENCY, (shell) =>
    enrichEntry(shell, prevById.get(shell.id), now),
  );

  const missing = carryOverMissing(previous?.entries ?? [], currentIds, now);

  await archiveMissing(enriched);

  const entries = [...enriched, ...missing].sort((a, b) => a.source_order - b.source_order);

  const output = {
    schema_version: SCHEMA_VERSION,
    generated_at: now,
    source_url: SOURCE_URL,
    count: entries.length,
    entries,
  };

  await mkdir(path.dirname(DATA_PATH), { recursive: true });
  await writeFile(DATA_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  const flaggedCount = missing.length;
  console.log(`Wrote ${entries.length} entries (${flaggedCount} flagged missing) to ${DATA_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
