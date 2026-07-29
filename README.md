# deflocked-municipalities

Tracks cities/counties that cancelled, rejected, or didn't renew Flock
Safety (ALPR) contracts, or deactivated existing cameras. Sourced from
[deflock.org/council#wins](https://deflock.org/council#wins), which serves
this data from a public [Directus](https://directus.io) collection at
`https://cms.deflock.me/items/flockWins`.

Data lives in [`data/municipalities.json`](data/municipalities.json), shape
documented in [`SCHEMA.md`](SCHEMA.md). Updated daily by
[`.github/workflows/scrape.yml`](.github/workflows/scrape.yml).

## Running locally

```sh
npm install
npm run scrape
```

`npm run scrape` fetches the source data, follows each article link, snapshots
it via the Wayback Machine, and writes `data/municipalities.json`, merging
against whatever is already there (see "No-op runs" in `SCHEMA.md`).

## Contributing corrections

This repo's commits are made by an automated bot account, not individual
contributors. If you spot an error or have a correction, please use the
intake path linked from the DeFlock project rather than opening a PR
directly.
