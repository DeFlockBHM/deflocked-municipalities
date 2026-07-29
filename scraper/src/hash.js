import { createHash } from "node:crypto";

export function contentHash(entry) {
  const key = {
    location: entry.location,
    date: { year: entry.date.year, month: entry.date.month, iso: entry.date.iso },
    status_raw: entry.status_raw,
    info: entry.info,
    source_url: entry.source_url,
  };
  const digest = createHash("sha256").update(JSON.stringify(key)).digest("hex");
  return `sha256:${digest}`;
}
