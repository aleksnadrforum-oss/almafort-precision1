// Tolerant search: keyboard-layout transliteration, typo tolerance, punctuation-free SKU match.

const EN_RU: Record<string, string> = {
  q: "й", w: "ц", e: "у", r: "к", t: "е", y: "н", u: "г", i: "ш", o: "щ", p: "з",
  "[": "х", "]": "ъ", a: "ф", s: "ы", d: "в", f: "а", g: "п", h: "р", j: "о",
  k: "л", l: "д", ";": "ж", "'": "э", z: "я", x: "ч", c: "с", v: "м", b: "и",
  n: "т", m: "ь", ",": "б", ".": "ю",
};

export function fromEnLayout(s: string) {
  return s
    .toLowerCase()
    .split("")
    .map((c) => EN_RU[c] ?? c)
    .join("");
}

export const normalize = (s: string) =>
  s.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]/gi, "");

/** Collapse repeated letters: "заглушшшка" -> "заглушка" */
const dedupe = (s: string) => s.replace(/(.)\1+/g, "$1");

function levenshtein(a: string, b: string) {
  const m = a.length;
  const n = b.length;
  if (!m || !n) return Math.max(m, n);
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n]!;
}

/** Returns a relevance score (higher = better), 0 = no match. */
export function scoreMatch(haystack: string, query: string) {
  const h = normalize(haystack);
  const variants = new Set([normalize(query), normalize(fromEnLayout(query))]);
  let best = 0;

  for (const q of variants) {
    if (!q) continue;
    if (h.startsWith(q)) best = Math.max(best, 100);
    else if (h.includes(q)) best = Math.max(best, 80);

    const hd = dedupe(h);
    const qd = dedupe(q);
    if (hd.includes(qd)) best = Math.max(best, 70);

    // typo tolerance over word tokens
    for (const token of hd.split(/(?=\d)|(?<=\d)/)) {
      if (!token || Math.abs(token.length - qd.length) > 3) continue;
      const d = levenshtein(token, qd);
      if (d <= Math.max(1, Math.floor(qd.length / 4))) best = Math.max(best, 60 - d * 5);
    }
    if (qd.length >= 4) {
      const d = levenshtein(hd.slice(0, qd.length + 2), qd);
      if (d <= 2) best = Math.max(best, 55 - d * 5);
    }
  }
  return best;
}
