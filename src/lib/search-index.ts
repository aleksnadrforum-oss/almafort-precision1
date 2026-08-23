// Лёгкий инвертированный индекс каталога: edge-ngram (2..10), транслитерация
// раскладки, игнор спецсимволов в артикулах, fuzziness AUTO.
// Строится один раз при загрузке модуля — выдача укладывается в единицы мс.

import { PRODUCTS, type Product } from "@/data/catalog";
import { fromEnLayout, normalize } from "@/lib/fuzzy-search";
import { parseQuery } from "@/lib/query-parse";

export type SearchHit = {
  id: string;
  sku: string;
  title: string;
  category: string;
  dimensions: string;
  price: number;
  stock_quantity: number;
  score: number;
};

const NGRAM_MIN = 2;
const NGRAM_MAX = 10;

/** Токенизация: слова и числа, спецсимволы (дефисы) — разделители. 458-B → ["458","b"] */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .split(/[^a-zа-я0-9]+/i)
    .filter(Boolean);
}

/** edge_ngram: "заглушка" → за, заг, загл, ... */
function edgeNgrams(token: string): string[] {
  const out: string[] = [];
  const max = Math.min(token.length, NGRAM_MAX);
  for (let i = NGRAM_MIN; i <= max; i++) out.push(token.slice(0, i));
  if (token.length < NGRAM_MIN) out.push(token);
  return out;
}

/** Схлопывание повторов: "заглушшшка" → "заглушка" */
const dedupe = (s: string) => s.replace(/(.)\1+/g, "$1");

/** fuzziness: "AUTO" — 0 правок до 3 символов, 1 до 5, далее 2. */
function autoFuzziness(len: number) {
  if (len <= 2) return 0;
  if (len <= 5) return 1;
  return 2;
}

function editDistance(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= n; j++) {
      const v = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[n]!;
}

type Doc = {
  p: Product;
  /** токены по полям с весами */
  fields: Array<{ tokens: string[]; boost: number }>;
  /** склеенный артикул без спецсимволов: 458b */
  flatSku: string;
  flatAll: string;
};

const DOCS: Doc[] = PRODUCTS.map((p) => ({
  p,
  fields: [
    { tokens: tokenize(p.sku), boost: 3 },
    { tokens: tokenize(p.name), boost: 2 },
    { tokens: tokenize(p.category), boost: 1.2 },
    { tokens: tokenize(p.dims), boost: 1 },
  ],
  flatSku: normalize(p.sku),
  flatAll: normalize(`${p.sku} ${p.name} ${p.category} ${p.dims}`),
}));

/** token → набор индексов документов (по edge-ngram) */
const INDEX = new Map<string, Set<number>>();
DOCS.forEach((doc, i) => {
  for (const f of doc.fields) {
    for (const t of f.tokens) {
      for (const g of edgeNgrams(t)) {
        let set = INDEX.get(g);
        if (!set) INDEX.set(g, (set = new Set()));
        set.add(i);
      }
    }
  }
});

function queryVariants(q: string) {
  const v = new Set<string>();
  const raw = q.trim().toLowerCase();
  if (raw) v.add(raw);
  // Строка из сметы («болт м8 оцинк штук 100») чистится от количества и сленга.
  const parsed = parseQuery(raw);
  if (parsed.clean && parsed.clean.toLowerCase() !== raw) v.add(parsed.clean.toLowerCase());
  if (parsed.entity) v.add([parsed.entity, parsed.size, parsed.finish].filter(Boolean).join(" ").toLowerCase());
  const layout = fromEnLayout(raw);
  if (layout && layout !== raw) v.add(layout);
  return [...v];
}

function scoreDoc(doc: Doc, qTokens: string[], flatQuery: string) {
  let score = 0;
  if (flatQuery.length >= 2) {
    if (doc.flatSku === flatQuery) score += 120;
    else if (doc.flatSku.startsWith(flatQuery)) score += 90;
    else if (doc.flatAll.includes(flatQuery)) score += 45;
  }

  for (const qt of qTokens) {
    const qd = dedupe(qt);
    let bestForToken = 0;
    for (const f of doc.fields) {
      for (const t of f.tokens) {
        const td = dedupe(t);
        let s = 0;
        if (t === qt) s = 40;
        else if (t.startsWith(qt)) s = 30;
        else if (td.startsWith(qd) || td === qd) s = 24;
        else if (t.includes(qt)) s = 16;
        else {
          const max = autoFuzziness(qd.length);
          if (max > 0) {
            const d = editDistance(qd, td, max);
            if (d <= max) s = 20 - d * 6;
          }
        }
        if (s > 0) bestForToken = Math.max(bestForToken, s * f.boost);
      }
    }
    score += bestForToken;
  }
  return score;
}

export function searchCatalog(query: string, limit = 8): SearchHit[] {
  const variants = queryVariants(query);
  if (!variants.length) return [];

  const candidates = new Set<number>();
  const allTokens: string[][] = [];

  for (const v of variants) {
    const tokens = tokenize(v);
    allTokens.push(tokens);
    for (const t of tokens) {
      const key = t.slice(0, NGRAM_MAX);
      for (let len = Math.min(key.length, NGRAM_MAX); len >= NGRAM_MIN; len--) {
        const set = INDEX.get(key.slice(0, len));
        if (set) {
          for (const i of set) candidates.add(i);
          break;
        }
      }
    }
  }

  const runPool = (pool: number[]): SearchHit[] => {
    const scored: SearchHit[] = [];
    for (const i of pool) {
      const doc = DOCS[i]!;
      let best = 0;
      for (let k = 0; k < variants.length; k++) {
        best = Math.max(best, scoreDoc(doc, allTokens[k]!, normalize(variants[k]!)));
      }
      if (best <= 0) continue;
      scored.push({
        id: doc.p.id,
        sku: doc.p.sku,
        title: doc.p.name,
        category: doc.p.category,
        dimensions: doc.p.dims,
        price: doc.p.price,
        stock_quantity: doc.p.stock.qty,
        score: Math.round(best),
      });
    }
    scored.sort((a, b) => b.score - a.score || a.sku.localeCompare(b.sku));
    return scored;
  };

  const all = DOCS.map((_, i) => i);
  let scored = runPool(candidates.size ? [...candidates] : all);
  // Опечатка в первых буквах («каплачок») ломает edge-ngram — добираем полным
  // сканом корпуса, он лёгкий и укладывается в единицы мс.
  if (candidates.size && (!scored.length || (scored[0]?.score ?? 0) < 40)) {
    scored = runPool(all);
  }
  return scored.slice(0, limit);

}
