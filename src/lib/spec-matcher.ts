// Smart Import Engine v5.0 — семантическое сопоставление «грязных» строк спецификации
// со всем каталогом ALMAFORT. Изоморфный модуль: используется и на сервере (парсер
// Excel), и на клиенте (пересопоставление вручную введённой строки).
import { PRODUCTS, unitPrice, type Product } from "@/data/catalog";

export type RowStatus = "MATCHED" | "AMBIGUOUS" | "NOT_FOUND";

export type Candidate = {
  sku: string;
  name: string;
  dims: string;
  price: number;
  is_service: boolean;
};

export type MatchResult = {
  status: RowStatus;
  /** 0–100 */
  score: number;
  sku: string | null;
  name: string | null;
  candidates: Candidate[];
};

/* ------------------------------------------------------------------ *
 * 1. Нормализация
 * ------------------------------------------------------------------ */

/** Кириллическая «х» и «×» в габаритах приводятся к латинской x, мусор вычищается. */
export function normalizeQuery(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/(\d)\s*(?:на|×|х|x|\*)\s*(\d)/g, "$1x$2")
    .replace(/[×хx]\s*(?=\d)/g, "x")
    .replace(/[^a-zа-я0-9xхd.,\-\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** «30 штук», «1200шт», «упаковка 100» → 30 / 1200 / 100. Нет цифр → 1. */
export function extractQuantity(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(1, Math.round(raw));
  }
  const digits = String(raw ?? "").replace(/[^\d]/g, "");
  if (!digits) return 1;
  const n = Number.parseInt(digits.slice(0, 9), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

type Params = {
  pair: string | null; // 20x40
  dia: number | null; // d20 / Ø20
  height: number | null; // h15 / высота 50
  thread: number | null; // М6
  plain: number[]; // одиночные числа (80, 100, 150 — тетрагедрон и т. п.)
};

const num = (s: string | undefined) => (s ? Number.parseInt(s, 10) : null);

export function extractParams(source: string): Params {
  const s = normalizeQuery(source);
  let pairM = s.match(/(\d{1,4})\s*x\s*(\d{1,4})/);
  // «чопик 1515», «профиль 2040» — слитная запись габарита
  if (!pairM) {
    const glued = s.match(/(?:^|\s)(\d{2})(\d{2})(?![\d])/);
    if (glued) pairM = ["", glued[1]!, glued[2]!] as unknown as RegExpMatchArray;
  }
  const diaM = s.match(/(?:d|ø|диам(?:етр)?)\s*\.?\s*(\d{1,4})/);
  const heightM = s.match(/(?:h|выс(?:ота)?)\s*[=\s]*\s*(\d{1,4})/);
  const threadM = s.match(/\b[мm]\s*(\d{1,2})\b/);
  const plain = [...s.matchAll(/\b(\d{1,4})\s*(?:мм|mm)?\b/g)]
    .map((m) => Number.parseInt(m[1]!, 10))
    .filter((n) => n > 0 && n <= 2000);

  return {
    pair: pairM ? `${num(pairM[1])}x${num(pairM[2])}` : null,
    dia: diaM ? num(diaM[1]) : null,
    height: heightM ? num(heightM[1]) : null,
    thread: threadM ? num(threadM[1]) : null,
    plain,
  };
}

/* ------------------------------------------------------------------ *
 * 2. Словарь синонимов ALMAFORT
 * ------------------------------------------------------------------ */

/** Прямые семантические попадания «сленг → артикул». */
const DIRECT_HITS: Array<[triggers: string[], sku: string]> = [
  [["стеклодержател", "крепеж стекла", "держатель стекла"], "MK-SD"],
  [["ласточкин хвост", "ласточка"], "MK-LH"],
  [["штангодержател", "держатель штанги", "штанга"], "MK-SHD"],
  [["уголок", "угольник"], "MK-UG"],
  [["латодержател", "ламел", "латофлекс"], "MK-LD"],
  [["кляймер", "клеймер", "клипса дпк", "крепеж дпк", "террасн"], "DPK-KL"],
  [["крепсс", "kreps", "крепс"], "KREPSS-PRO"],
  [["канистр", "горловин", "крышка для канистры"], "KAN-CAP-R"],
  [["евровинт", "конфирмат"], "ZGD-EV"],
  [["саморез"], "ZGD-SM"],
  [["эксцентрик", "минификс"], "ZGD-EX"],
  [["3d печат", "3d печ", "fdm", "напечатат", "печать детал"], "SRV-FDM"],
  [["реверс", "скан", "обмер", "чертеж по образцу"], "SRV-RE3D"],
  [["лит", "отлить", "пресс форма", "пресс-форма", "тираж"], "SRV-INJ"],
];

/** Семантические группы: триггер → пул артикулов для уточнения. */
const GROUPS: Array<{ id: string; triggers: string[]; skus: (p: Product) => boolean }> = [
  {
    id: "zaglushki",
    triggers: ["заглушк", "чопик", "пробка", "заглушек", "крышка", "колпачок"],
    skus: (p) => p.sku.startsWith("ZGV") || p.sku.startsWith("ZGD"),
  },
  {
    id: "opory",
    triggers: ["опора", "опоры", "ножка", "ножки", "подпятник", "каблук", "регулируем", "шаров"],
    skus: (p) => p.sku.startsWith("OP-"),
  },
  {
    id: "mebel_krepez",
    triggers: ["крепеж мебельн", "мебельный крепеж", "фурнитура"],
    skus: (p) => p.sku.startsWith("MK-"),
  },
  {
    id: "sandwich",
    triggers: ["сэндвич", "сендвич", "терморазрыв", "тетрагедрон", "тетраэдр", "панельн"],
    skus: (p) => p.sku.startsWith("TG-") || p.sku === "KREPSS-PRO",
  },
  {
    id: "services",
    triggers: ["услуга", "изготовит", "изготовлен", "копия", "аналог детали", "на заказ"],
    skus: (p) => p.is_service,
  },
];

const dedupeLetters = (s: string) => s.replace(/(.)\1+/g, "$1");

function levenshtein(a: string, b: string) {
  const m = a.length;
  const n = b.length;
  if (!m || !n) return Math.max(m, n);
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n]!;
}

/** Триггер найден в строке — с прощением опечаток («крепс» ↔ «крепсс»). */
function triggerHit(query: string, trigger: string): boolean {
  if (query.includes(trigger)) return true;
  const t = dedupeLetters(trigger);
  const q = dedupeLetters(query);
  if (q.includes(t)) return true;
  if (trigger.includes(" ")) return false;
  for (const token of q.split(" ")) {
    if (!token || Math.abs(token.length - t.length) > 2) continue;
    const tolerance = t.length >= 8 ? 2 : t.length >= 5 ? 1 : 0;
    if (tolerance && levenshtein(token, t) <= tolerance) return true;
  }
  return false;
}

const bySku = new Map(PRODUCTS.map((p) => [p.sku.toLowerCase(), p]));
const skuKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const bySkuLoose = new Map(PRODUCTS.map((p) => [skuKey(p.sku), p]));

const toCandidate = (p: Product, qty: number): Candidate => ({
  sku: p.sku,
  name: p.name,
  dims: p.dims,
  price: p.is_service ? 0 : unitPrice(p, qty),
  is_service: p.is_service,
});

/* ------------------------------------------------------------------ *
 * 3. Ядро сопоставления
 * ------------------------------------------------------------------ */

function paramsMatch(q: Params, p: Params): "exact" | "conflict" | "none" {
  let hits = 0;
  if (q.pair) {
    if (!p.pair) return "conflict";
    if (p.pair !== q.pair) return "conflict";
    hits++;
  }
  if (q.dia !== null) {
    if (p.dia === null || p.dia !== q.dia) return "conflict";
    hits++;
  }
  if (q.height !== null) {
    if (p.height === null || p.height !== q.height) return "conflict";
    hits++;
  }
  if (q.thread !== null) {
    if (p.thread === null || p.thread !== q.thread) return "conflict";
    hits++;
  }
  return hits ? "exact" : "none";
}

/** Одиночное число («заглушка 15», «тетрагедрон 150») сверяем со всеми параметрами товара. */
function plainMatch(q: Params, p: Params): boolean {
  if (!q.plain.length) return false;
  const pool = new Set<number>(p.plain);
  if (p.dia !== null) pool.add(p.dia);
  if (p.height !== null) pool.add(p.height);
  if (p.pair) for (const n of p.pair.split("x")) pool.add(Number(n));
  return q.plain.some((n) => pool.has(n));
}

/** Полнотекстовая близость названия товара и клиентской строки (0–1). */
function nameAffinity(query: string, p: Product): number {
  const hay = normalizeQuery(`${p.name} ${p.dims} ${p.category}`);
  const tokens = query.split(" ").filter((t) => t.length >= 4);
  if (!tokens.length) return 0;
  let hit = 0;
  for (const t of tokens) if (triggerHit(hay, t)) hit++;
  return hit / tokens.length;
}

/** Сколько значимых слов названия товара отсутствует в клиентской строке. */
function extraWords(query: string, p: Product): number {
  const stop = new Set(["мебельная", "мебельный", "для", "мм", "под", "с", "и"]);
  const words = normalizeQuery(p.name)
    .split(" ")
    .filter((w) => w.length >= 4 && !/\d/.test(w) && !stop.has(w));
  return words.filter((w) => !triggerHit(query, w)).length;
}

export function matchRow(rawName: string, quantity: number): MatchResult {
  const query = normalizeQuery(rawName);
  const empty: MatchResult = { status: "NOT_FOUND", score: 0, sku: null, name: null, candidates: [] };
  if (!query) return empty;

  // 1. Артикул в чистом виде — 100 % попадание.
  for (const token of [query, ...query.split(" ")]) {
    const direct = bySku.get(token) ?? bySkuLoose.get(skuKey(token));
    if (direct) {
      return {
        status: "MATCHED",
        score: 100,
        sku: direct.sku,
        name: direct.name,
        candidates: [toCandidate(direct, quantity)],
      };
    }
  }

  const qp = extractParams(rawName);

  // 2. Прямые семантические попадания (стеклодержатель, кляймер, крепсс, услуги…).
  for (const [triggers, sku] of DIRECT_HITS) {
    if (!triggers.some((t) => triggerHit(query, t))) continue;
    const p = bySku.get(sku.toLowerCase());
    if (!p) continue;
    return {
      status: "MATCHED",
      score: 90,
      sku: p.sku,
      name: p.name,
      candidates: [toCandidate(p, quantity)],
    };
  }

  // 3. Группа синонимов + уточнение по габаритам.
  const group = GROUPS.find((g) => g.triggers.some((t) => triggerHit(query, t)));
  if (group) {
    const pool = PRODUCTS.filter(group.skus);
    const strict = pool.filter((p) => paramsMatch(qp, extractParams(`${p.name} ${p.dims}`)) === "exact");
    let narrowed = strict;
    if (!narrowed.length) narrowed = pool.filter((p) => plainMatch(qp, extractParams(`${p.name} ${p.dims}`)));

    // Из «ножка для мебели 50мм» выбираем базовую опору h50, а не шаровую:
    // выигрывает товар, чьё название не содержит лишних уточнений.
    if (narrowed.length > 1) {
      const scored = narrowed.map((p) => ({ p, extra: extraWords(query, p) }));
      const min = Math.min(...scored.map((x) => x.extra));
      const winners = scored.filter((x) => x.extra === min);
      const runnerUp = Math.min(...scored.filter((x) => x.extra !== min).map((x) => x.extra), 99);
      if (winners.length === 1 && runnerUp - min >= 1) narrowed = [winners[0]!.p];
    }

    if (narrowed.length === 1) {
      const p = narrowed[0]!;
      return {
        status: "MATCHED",
        score: 95,
        sku: p.sku,
        name: p.name,
        candidates: [toCandidate(p, quantity)],
      };
    }
    const list = (narrowed.length ? narrowed : pool)
      .map((p) => ({ p, a: nameAffinity(query, p) }))
      .sort((x, y) => y.a - x.a)
      .map((x) => x.p);

    if (list.length === 1) {
      const p = list[0]!;
      return { status: "MATCHED", score: 88, sku: p.sku, name: p.name, candidates: [toCandidate(p, quantity)] };
    }
    if (list.length) {
      return {
        status: "AMBIGUOUS",
        score: narrowed.length ? 70 : 55,
        sku: null,
        name: null,
        candidates: list.slice(0, 12).map((p) => toCandidate(p, quantity)),
      };
    }
  }

  // 4. Глобальный нечёткий поиск по всему каталогу.
  const ranked = PRODUCTS.map((p) => {
    let score = nameAffinity(query, p) * 70;
    const pp = extractParams(`${p.name} ${p.dims}`);
    if (paramsMatch(qp, pp) === "exact") score += 25;
    else if (plainMatch(qp, pp)) score += 12;
    return { p, score };
  })
    .filter((r) => r.score >= 20)
    .sort((a, b) => b.score - a.score);

  const top = ranked[0];
  if (!top) return empty;
  const second = ranked[1];
  if (top.score >= 80 && (!second || top.score - second.score >= 15)) {
    return {
      status: "MATCHED",
      score: Math.round(Math.min(100, top.score)),
      sku: top.p.sku,
      name: top.p.name,
      candidates: [toCandidate(top.p, quantity)],
    };
  }
  if (top.score >= 40) {
    return {
      status: "AMBIGUOUS",
      score: Math.round(top.score),
      sku: null,
      name: null,
      candidates: ranked.slice(0, 8).map((r) => toCandidate(r.p, quantity)),
    };
  }
  return { ...empty, score: Math.round(top.score) };
}
