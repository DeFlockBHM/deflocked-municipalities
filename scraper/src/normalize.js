import { slugify } from "./slugify.js";
import { parseMonthYear } from "./parseDate.js";
import { stripTags, extractFirstLink } from "./htmlUtils.js";
import { contentHash } from "./hash.js";

const STATUS_MAP = {
  "cameras deactivated": "deactivated",
  "contract rejected": "rejected",
  "contract canceled": "cancelled",
  "contract cancelled": "cancelled",
  "contract not renewed": "not_renewed",
  "contract paused": "paused",
};

function normalizeStatus(raw) {
  return STATUS_MAP[raw.trim().toLowerCase()] ?? "other";
}

function parseLocation(cityState) {
  const idx = cityState.lastIndexOf(",");
  if (idx === -1) {
    return { city: cityState.trim(), state: "", text: cityState.trim() };
  }
  return {
    city: cityState.slice(0, idx).trim(),
    state: cityState.slice(idx + 1).trim(),
    text: cityState.trim(),
  };
}

// Builds the "shell" of an entry from a raw source row: everything derivable
// from the source table itself, before we go fetch/archive the linked article.
// `sourceOrder` reflects display order (see rawRowsToOrderedShells); `id` is
// assigned separately once collisions across the full row set are known.
export function buildShell(row, sourceOrder) {
  const location = parseLocation(row.cityState);
  const date = parseMonthYear(row.monthYear);
  const statusRaw = row.outcome.trim();
  const info = stripTags(row.description);
  const sourceUrl = extractFirstLink(row.description);
  if (!sourceUrl) {
    throw new Error(`Row ${row.id} (${row.cityState}) has no article link in description`);
  }
  let linkDomain = null;
  try {
    linkDomain = new URL(sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    throw new Error(`Row ${row.id} (${row.cityState}) has an unparseable source_url: ${sourceUrl}`);
  }

  const shell = {
    _sourceId: row.id,
    source_order: sourceOrder,
    location,
    date,
    status: normalizeStatus(statusRaw),
    status_raw: statusRaw,
    info,
    source_url: sourceUrl,
    link_domain: linkDomain,
  };
  shell.content_hash = contentHash(shell);
  return shell;
}

// Assigns stable slug ids, breaking ties deterministically by the source's
// own numeric row id (ascending) so a new colliding row always gets the
// suffix rather than perturbing a previously-assigned id.
export function assignIds(shells) {
  const byBaseSlug = new Map();
  const ordered = [...shells].sort((a, b) => a._sourceId - b._sourceId);
  for (const shell of ordered) {
    const base = `${slugify(`${shell.location.city} ${shell.location.state}`)}-${shell.date.iso.slice(0, 7)}`;
    const count = byBaseSlug.get(base) ?? 0;
    byBaseSlug.set(base, count + 1);
    shell.id = count === 0 ? base : `${base}-${count + 1}`;
  }
  return shells;
}
