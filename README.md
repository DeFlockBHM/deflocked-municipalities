# deflocked-municipalities

Tracks cities/counties that cancelled, rejected, or didn't renew Flock
Safety (ALPR) contracts, or deactivated existing cameras. Sourced from the
[Institute for Justice's ALPR contract cancellation database](https://ij.org/institute-for-justice-unveils-new-database-tracking-cancelations-of-license-plate-reader-contracts/),
part of their [Plate Privacy Project](https://plateprivacy.com).

Data lives in [`data/municipalities.json`](data/municipalities.json), shape
documented in [`SCHEMA.md`](SCHEMA.md). Updated daily by
[`.github/workflows/scrape.yml`](.github/workflows/scrape.yml).

## Running locally

```sh
npm install
npx playwright install --with-deps chromium
npm run scrape
```

`npm run scrape` loads IJ's tracker page in a headless browser (see "Why a
browser, not a plain fetch" below), follows each article link, snapshots it
via the Wayback Machine, and writes `data/municipalities.json`, merging
against whatever is already there (see "No-op runs" in `SCHEMA.md`).

## Why a browser, not a plain fetch

IJ's site sits behind a Cloudflare JS challenge, so a plain HTTP request
gets a 403 challenge page instead of data. The scraper uses
[`playwright-extra`](https://www.npmjs.com/package/playwright-extra) with
the stealth plugin to run a real headless Chromium instance, wait out the
challenge, and parse the incident list directly out of the rendered page's
own `data-*` attributes - the same approach the
[`flock-misuse-tracker`](https://github.com/DeFlockBHM/flock-misuse-tracker)
repo already uses for IJ's companion ALPR abuse database (same underlying
WordPress block, different dataset). No LLM calls are involved in scraping.
If IJ tightens that challenge, the scrape may start failing and will need
attention.

## Migration note (2026-09)

This repo previously sourced from `deflock.org/council#wins`, which
stopped updating. It now sources from IJ's database instead. The prior
`deflock.org`-sourced dataset was cleared rather than merged, since the two
sources use different row identities and IJ's is the actively maintained
one going forward - see git history before this change if you need the old
data.

## Contributing corrections

This repo's commits are made by an automated bot account, not individual
contributors. If you spot an error or have a correction, please use the
intake path linked from the DeFlock project rather than opening a PR
directly.
