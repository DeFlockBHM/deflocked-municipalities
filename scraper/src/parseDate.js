const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// IJ's data-date attribute is a full "YYYY-MM-DD" (day precision - IJ dates
// its cancelations more precisely than deflock.org's old "Month YYYY" did).
// Throws on anything else so a source format change surfaces immediately.
export function parseIsoDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso ?? "").trim());
  if (!match) {
    throw new Error(`Unrecognized date format from source: ${JSON.stringify(iso)}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new Error(`Month out of range in date: ${JSON.stringify(iso)}`);
  }
  return {
    text: `${MONTHS[month - 1]} ${year}`,
    year,
    month,
    iso: `${match[1]}-${match[2]}-${match[3]}`,
  };
}
