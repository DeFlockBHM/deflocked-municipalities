import { slugify } from "./slugify.js";
import { parseIsoDate } from "./parseDate.js";
import { contentHash } from "./hash.js";
import { US_STATE_ABBR } from "./usStates.js";

const STATUS_MAP = {
  "early-termination": "early_termination",
  "cancelation-before-deployment": "cancelation_before_deployment",
  "nonrenewal-after-expiration": "nonrenewal_after_expiration",
  "nonrenewal-defunding": "nonrenewal_defunding",
};

function normalizeStatus(typeSlug) {
  return STATUS_MAP[typeSlug] ?? "other";
}

function resolveStateAbbr(stateName) {
  const abbr = US_STATE_ABBR[stateName];
  if (!abbr) {
    throw new Error(`Unrecognized state name from source: ${JSON.stringify(stateName)}`);
  }
  return abbr;
}

// Builds the "shell" of an entry from a raw parsed row: everything derivable
// from the source page itself, before we go fetch/archive the linked
// article. `sourceOrder` reflects the source's own display order (newest
// first); `id` is assigned separately once collisions across the full row
// set are known.
export function buildShell(row, sourceOrder) {
  if (!row.ij_source_id) {
    throw new Error("Row is missing its IJ incident id (data-alpr-incident)");
  }
  if (!row.city || !row.state_name) {
    throw new Error(`Row ${row.ij_source_id} is missing city/state`);
  }
  if (!row.source_url) {
    throw new Error(`Row ${row.ij_source_id} (${row.city}, ${row.state_name}) has no source link`);
  }

  const stateAbbr = resolveStateAbbr(row.state_name);
  const location = {
    city: row.city,
    state: stateAbbr,
    text: `${row.city}, ${stateAbbr}`,
  };
  const date = parseIsoDate(row.date_iso);

  let linkDomain = null;
  try {
    linkDomain = new URL(row.source_url).hostname.replace(/^www\./, "");
  } catch {
    throw new Error(`Row ${row.ij_source_id} (${location.text}) has an unparseable source_url: ${row.source_url}`);
  }

  const shell = {
    _sourceId: row.ij_source_id,
    ij_source_id: row.ij_source_id,
    source_order: sourceOrder,
    location,
    date,
    status: normalizeStatus(row.type_slug),
    status_raw: row.type_name,
    manufacturer: row.manufacturer_slug,
    manufacturer_name: row.manufacturer_name,
    info: row.description,
    source_url: row.source_url,
    link_domain: linkDomain,
  };
  shell.content_hash = contentHash(shell);
  return shell;
}

// Assigns stable slug ids, breaking ties deterministically by IJ's own
// numeric incident id (ascending) so a new colliding row always gets the
// suffix rather than perturbing a previously-assigned id.
export function assignIds(shells) {
  const byBaseSlug = new Map();
  const ordered = [...shells].sort((a, b) => Number(a._sourceId) - Number(b._sourceId));
  for (const shell of ordered) {
    const base = `${slugify(`${shell.location.city} ${shell.location.state}`)}-${shell.date.iso.slice(0, 7)}`;
    const count = byBaseSlug.get(base) ?? 0;
    byBaseSlug.set(base, count + 1);
    shell.id = count === 0 ? base : `${base}-${count + 1}`;
  }
  return shells;
}
