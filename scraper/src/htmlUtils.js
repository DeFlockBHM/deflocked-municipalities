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
