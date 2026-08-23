// Изоморфная очистка «грязных» строк спецификации: количества, слитые ячейки,
// кратность упаковки и недостающие габариты. Используется парсером на сервере
// и экраном проверки на клиенте.
import { PRODUCTS } from "@/data/catalog";

/** Минимальная партия отгрузки, если количество распознать не удалось. */
export const MOQ = 100;

/** Кратность упаковки по группам артикулов. */
export function packMultiple(sku: string): number {
  if (/^ZGD-/.test(sku)) return 100; // декоративные заглушки — коробами по 100
  return 1;
}

export type QtyParse = {
  /** null — количество не распознано, вызывающий подставляет MOQ. */
  qty: number | null;
  note: string | null;
  error: string | null;
};

const ABSTRACT = [
  "весь объем",
  "весь объём",
  "по потребности",
  "потребность",
  "коробка",
  "короб",
  "упаковка",
  "уточнить",
  "по факту",
  "нужно",
];

const NBSP = /[\u00a0\u2007\u202f\u2009]/g;

/**
 * «1 500 шт.» → 1500, «5тыс» → 5000, «~200» → 200, «100,5» → 101 (с пометкой),
 * «-100» / «сто» → ошибка строки, пусто / «на весь объём» → null.
 */
export function parseQuantity(raw: unknown): QtyParse {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (raw < 0) return { qty: null, note: null, error: "Отрицательное количество" };
    if (raw === 0) return { qty: null, note: null, error: "Количество равно нулю" };
    if (!Number.isInteger(raw))
      return {
        qty: Math.ceil(raw),
        note: `Количество ${raw} округлено до ${Math.ceil(raw)} шт (только целые единицы)`,
        error: null,
      };
    return { qty: raw, note: null, error: null };
  }

  const src = String(raw ?? "").replace(NBSP, " ").trim().toLowerCase();
  if (!src) return { qty: null, note: null, error: null };
  if (ABSTRACT.some((w) => src.includes(w)) && !/\d/.test(src))
    return { qty: null, note: null, error: null };

  if (/^-\s*\d/.test(src)) return { qty: null, note: null, error: "Отрицательное количество" };
  if (!/\d/.test(src)) return { qty: null, note: null, error: null };

  // «5 тыс», «1,5 тыс», «2к»
  const thousands = src.match(/(\d+(?:[.,]\d+)?)\s*(?:тыс\.?|тысяч[а-я]*|k|к)(?![а-яa-z])/);
  let value: number | null = null;
  let approxNote: string | null = null;

  if (thousands) {
    value = Number.parseFloat(thousands[1]!.replace(",", ".")) * 1000;
  } else {
    const cleaned = src
      .replace(/[~≈>≥примерноокол]/g, (m) => (/[~≈>≥]/.test(m) ? " " : m))
      .replace(/\s+/g, "");
    const m = cleaned.match(/(\d+(?:[.,]\d+)?)/);
    if (!m) return { qty: null, note: null, error: "Количество должно быть целым числом" };
    // «1 500 шт.» — пробелы уже удалены, склеиваем разряды
    value = Number.parseFloat(m[1]!.replace(",", "."));
  }

  if (/[~≈]|около|примерно/.test(src)) approxNote = "Приблизительное количество уточнено до целого";
  if (value === null || !Number.isFinite(value) || value <= 0)
    return { qty: null, note: null, error: "Количество должно быть целым числом" };
  if (value > 100_000_000) return { qty: null, note: null, error: "Количество вне допустимых пределов" };

  if (!Number.isInteger(value)) {
    const up = Math.ceil(value);
    return {
      qty: up,
      note: `Количество ${String(raw).trim()} округлено до ${up} шт (только целые единицы)`,
      error: null,
    };
  }
  return { qty: value, note: approxNote, error: null };
}

/** Округление вверх до кратности упаковки. */
export function applyPack(sku: string, qty: number): { qty: number; note: string | null } {
  const mult = packMultiple(sku);
  if (mult <= 1 || qty % mult === 0) return { qty, note: null };
  const up = Math.ceil(qty / mult) * mult;
  return { qty: up, note: `Изменено до ${up.toLocaleString("ru-RU")} шт (кратность упаковки ${mult})` };
}

const TRASH_TAIL =
  /\b(срочно|для цеха|на склад|по возможности|в первую очередь|заказ|для производства|для монтажа)\b/gi;

/**
 * Клиент написал всё в одной ячейке: «Заглушка 60х60 мм - 15 000 штук срочно для цеха».
 * Возвращает очищенное наименование и вытащенное количество.
 */
export function splitMixedCell(text: string): { name: string; qty: number | null; note: string | null } {
  const src = text.replace(NBSP, " ").trim();
  const qtyRe =
    /(?:^|[-–—,;:]|\s)(\d[\d\s]*(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s*тыс\.?)\s*(штук[аи]?|штуки|шт\.?|тыс\.?|pcs|ед\.?)/i;
  const m = src.match(qtyRe);
  if (!m) return { name: src.replace(TRASH_TAIL, "").replace(/\s+/g, " ").trim(), qty: null, note: null };
  const parsed = parseQuantity(`${m[1]} ${m[2]}`);
  const name = (src.slice(0, m.index ?? 0) + " " + src.slice((m.index ?? 0) + m[0].length))
    .replace(TRASH_TAIL, "")
    .replace(/[-–—,;:]\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return {
    name: name || src,
    qty: parsed.qty,
    note: parsed.qty ? "Количество извлечено из текста строки" : null,
  };
}

/** Круглые заглушки каталога — варианты для выбора диаметра. */
export const ROUND_CAPS = PRODUCTS.filter((p) => /^ZGV-D/.test(p.sku)).map((p) => ({
  sku: p.sku,
  name: p.name,
  dims: p.dims,
}));

/**
 * «Заглушка для трубы круглая — 500 шт» без диаметра: гадать нельзя,
 * строка обязана уйти в статус выбора размера.
 */
export function needsDiameter(text: string): boolean {
  const t = text.toLowerCase().replace(/ё/g, "е");
  const isCap = /заглушк|чопик|пробк|колпач/.test(t);
  const isRound = /кругл|круг\b|d\s?\d|ø|диаметр/.test(t);
  const hasSize = /(\d{1,3})\s*[хx×]\s*(\d{1,3})/.test(t) || /(?:d|ø|диам(?:етр)?)\s*\.?\s*\d{1,3}/.test(t);
  return isCap && isRound && !hasSize;
}
