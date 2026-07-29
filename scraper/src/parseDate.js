const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

// Source data is consistently "Month YYYY" (see flockWins CMS collection).
// Throws on anything else so a source format change surfaces immediately
// instead of silently producing a wrong date.
export function parseMonthYear(text) {
  const match = /^([A-Za-z]+)\s+(\d{4})$/.exec(text.trim());
  if (!match) {
    throw new Error(`Unrecognized monthYear format: ${JSON.stringify(text)}`);
  }
  const monthIndex = MONTHS.indexOf(match[1].toLowerCase());
  if (monthIndex === -1) {
    throw new Error(`Unrecognized month name: ${JSON.stringify(match[1])}`);
  }
  const year = Number(match[2]);
  const month = monthIndex + 1;
  const iso = `${year}-${String(month).padStart(2, "0")}-01`;
  return { text: text.trim(), year, month, iso };
}
