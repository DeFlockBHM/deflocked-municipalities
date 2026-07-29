import { readFile } from "node:fs/promises";

// Exit 0 = there's a substantive change worth committing.
// Exit 1 = the only diff is timestamp bumps (generated_at / last_seen_at on
// otherwise-unchanged rows) - CI should discard the write and skip the commit
// so a daily no-op scrape doesn't produce a noise commit.
function stripVolatile(doc) {
  const { generated_at, ...rest } = doc;
  return {
    ...rest,
    entries: (rest.entries ?? [])
      .map(({ last_seen_at, ...entry }) => entry)
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

const [oldPath, newPath] = process.argv.slice(2);
if (!oldPath || !newPath) {
  console.error("Usage: node checkSubstantiveChange.js <oldFile> <newFile>");
  process.exit(2);
}

const [oldDoc, newDoc] = await Promise.all([readJsonIfExists(oldPath), readJsonIfExists(newPath)]);

if (!oldDoc) {
  console.log("No previous data file - treating as substantive change.");
  process.exit(0);
}

const same = JSON.stringify(stripVolatile(oldDoc)) === JSON.stringify(stripVolatile(newDoc));
if (same) {
  console.log("No substantive change (timestamps only).");
  process.exit(1);
}
console.log("Substantive change detected.");
process.exit(0);
