// Looks up each entry's municipality population from the Census Bureau's
// American Community Survey 5-year estimates (ACS5) and writes it onto
// `location.population` (+ year/geography/matched-name metadata), so
// downstream consumers (e.g. DeFlockBHM's stats rollup) can sum it without
// needing to know anything about Census geography.
//
// ACS5 is used instead of the Population Estimates Program (PEP) API
// because PEP's sub-state geography (place/county subdivision/county) was
// discontinued after the 2019 vintage - the 2021+ PEP datasets only go
// down to state level. ACS5's rolling 5-year estimate is the current
// source with place/county-subdivision/county population for every size
// of municipality (ACS1 only covers places above ~65k).
//
// ACS5 covers three separate geography levels with separate queries, and a
// US municipality can be any of the three depending on state/local
// government structure:
//   - "place"             incorporated cities/towns/villages/boroughs, plus CDPs
//   - "county subdivision" townships/minor civil divisions (mostly Northeast/Midwest)
//   - "county"             counties (some rows in this dataset are county-level
//                           contract cancellations, not a single city)
// We don't know which one a given row is from `location.city` alone, so we
// guess an order to try from the name's suffix (see `guessGeographyOrder`)
// and fall back through the others on a miss.
import { STATE_FIPS } from "./stateFips.js";

// ACS5 vintage year to query (the year the 5-year window ends). Census
// publishes a new vintage annually, roughly a year behind; bump this when
// a newer one is confirmed available - a stale vintage still returns
// valid, just slightly dated, population figures.
const VINTAGE = 2024;
const POPULATION_VAR = "B01003_001E"; // ACS "Total Population" table
const CENSUS_BASE = `https://api.census.gov/data/${VINTAGE}/acs/acs5`;

const GEOGRAPHY = {
  place: { forParam: (fips) => `place:*&in=state:${fips}`, label: "place" },
  county_subdivision: {
    forParam: (fips) => `county subdivision:*&in=state:${fips}+county:*`,
    label: "county_subdivision",
  },
  county: { forParam: (fips) => `county:*&in=state:${fips}`, label: "county" },
};

// Trailing words Census appends to the local-government-type part of NAME
// (e.g. "Chicago city", "Bedford charter township", "Starke County") that
// aren't part of the place's actual name. Longest matches first so
// "charter township" strips as one unit rather than leaving "charter".
const TYPE_SUFFIXES = [
  "charter township",
  "consolidated government",
  "metropolitan government",
  "unified government",
  "urban county",
  "township",
  "borough",
  "village",
  "municipality",
  "corporation",
  "county",
  "city",
  "town",
  "cdp",
];

function normalize(name) {
  return name
    .toLowerCase()
    .replace(/\bst\.?\b/g, "saint")
    .replace(/[.'’]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Strips a trailing government-type word/phrase, if present, from an
// already-lowercased, comma-stripped name fragment.
function stripTypeSuffix(normalized) {
  for (const suffix of TYPE_SUFFIXES) {
    if (normalized === suffix) continue;
    if (normalized.endsWith(` ${suffix}`)) {
      return normalized.slice(0, -(suffix.length + 1)).trim();
    }
  }
  return normalized;
}

// Census NAME is like "Chicago city, Illinois" or
// "Bedford charter township, Monroe County, Michigan" - we only want the
// first (local) segment, with its trailing type word stripped.
function coreNameFromCensusName(censusName) {
  const local = censusName.split(",")[0];
  return stripTypeSuffix(normalize(local));
}

// `location.city` is like "Bedford Township" or "Starke County" or
// "Chicago" - IJ's source text only ever appends "County"/"Township" as a
// government-type descriptor (per SCHEMA.md), so those are the only
// suffixes safe to strip here. Unlike coreNameFromCensusName(), we must
// NOT strip other type words (city/town/village/borough/...): several real
// place names end in one intrinsically (e.g. "Panama City", "Lincoln
// City") and stripping it would collapse "Lincoln City" down to "Lincoln",
// which then false-matches the unrelated "Lincoln County, Oregon".
const CITY_INPUT_SUFFIXES = ["county", "township"];
function coreNameFromCity(city) {
  const normalized = normalize(city);
  for (const suffix of CITY_INPUT_SUFFIXES) {
    if (normalized.endsWith(` ${suffix}`)) {
      return normalized.slice(0, -(suffix.length + 1)).trim();
    }
  }
  return normalized;
}

function guessGeographyOrder(city) {
  const lower = city.toLowerCase();
  if (/\bcounty\b/.test(lower)) return ["county", "place", "county_subdivision"];
  if (/\btownship\b/.test(lower)) return ["county_subdivision", "place", "county"];
  return ["place", "county_subdivision", "county"];
}

async function censusFetch(url) {
  const apiKey = process.env.CENSUS_API_KEY;
  if (!apiKey) return null;
  const sep = url.includes("?") ? "&" : "?";
  const res = await fetch(`${url}${sep}key=${apiKey}`);
  if (!res.ok) return null;
  const rows = await res.json();
  const [header, ...body] = rows;
  const nameIdx = header.indexOf("NAME");
  const popIdx = header.indexOf(POPULATION_VAR);
  return body.map((row) => ({ name: row[nameIdx], population: parseInt(row[popIdx], 10) }));
}

// Per-state, per-geography-level cache so a state's place/subdivision/
// county lists are each fetched at most once per run, no matter how many
// of that state's entries need a lookup.
const stateCache = new Map();

async function getStateGeography(stateAbbr, level) {
  const cacheKey = `${stateAbbr}:${level}`;
  if (stateCache.has(cacheKey)) return stateCache.get(cacheKey);

  const fips = STATE_FIPS[stateAbbr];
  const promise = fips
    ? censusFetch(`${CENSUS_BASE}?get=NAME,${POPULATION_VAR}&for=${GEOGRAPHY[level].forParam(fips)}`)
    : Promise.resolve(null);
  stateCache.set(cacheKey, promise);
  return promise;
}

// Looks up population for one {city, state}. Returns null if no
// CENSUS_API_KEY is set, the state/geography data couldn't be fetched, or
// no name in any geography level matches after normalization.
export async function lookupPopulation({ city, state }) {
  const target = coreNameFromCity(city);
  if (!target) return null;

  for (const level of guessGeographyOrder(city)) {
    const rows = await getStateGeography(state, level);
    if (!rows) continue;
    const matches = rows.filter((row) => coreNameFromCensusName(row.name) === target);
    const match = matches[0];
    if (match && Number.isFinite(match.population)) {
      return {
        population: match.population,
        population_year: VINTAGE,
        population_geography: GEOGRAPHY[level].label,
        population_matched_name: match.name,
        // Same-named municipalities in different counties of the same
        // state (e.g. two "Bedford Township"s in Michigan) can't be told
        // apart by name+state alone - we pick the first Census returns,
        // which may be the wrong one. Flagged for curator review rather
        // than guessed at silently; see "Population lookups" in SCHEMA.md.
        population_ambiguous: matches.length > 1,
      };
    }
  }
  return null;
}

// Fills in `location.population*` fields on any entry that doesn't already
// have one, mutating entries in place. Entries that already matched are
// left untouched (population is effectively static between vintages);
// entries that failed to match are retried on every run, since a miss is
// usually a normalization gap worth fixing rather than a permanent state.
export async function enrichPopulation(entries) {
  if (!process.env.CENSUS_API_KEY) {
    console.log("Population: CENSUS_API_KEY not set, skipping population lookup.");
    return;
  }
  let matched = 0;
  let attempted = 0;
  for (const entry of entries) {
    if (entry.location.population != null) continue;
    attempted++;
    const result = await lookupPopulation(entry.location);
    if (result) {
      Object.assign(entry.location, result);
      matched++;
    } else {
      entry.location.population = null;
      entry.location.population_year = null;
      entry.location.population_geography = null;
      entry.location.population_matched_name = null;
      entry.location.population_ambiguous = false;
    }
  }
  console.log(`Population: matched ${matched}/${attempted} unresolved entries.`);
}
