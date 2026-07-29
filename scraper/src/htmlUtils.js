const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " ",
};

export function decodeEntities(str) {
  return str.replace(/&(#39|#\d+|[a-z]+);/gi, (m, code) => {
    if (code in ENTITIES) return ENTITIES[code];
    if (code.startsWith("#")) {
      const codePoint = Number(code.slice(1));
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : m;
    }
    return m;
  });
}

export function stripTags(html) {
  return decodeEntities(html.replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

export function extractFirstLink(html) {
  const match = /<a\s+[^>]*href="([^"]+)"/i.exec(html);
  return match ? match[1] : null;
}
