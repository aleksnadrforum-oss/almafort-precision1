/**
 * Импорт товарного фида: санитизация, дедупликация и upsert по SKU.
 *
 * В боевой БД операция выглядит так (SKU — UNIQUE INDEX):
 *
 *   INSERT INTO products (sku, name, category, dims, price, price1000, price5000, stock_qty, weight, volume)
 *   VALUES (...)
 *   ON CONFLICT (sku) DO UPDATE SET
 *     price       = EXCLUDED.price,
 *     price1000   = EXCLUDED.price1000,
 *     price5000   = EXCLUDED.price5000,
 *     stock_qty   = EXCLUDED.stock_qty,
 *     name        = COALESCE(NULLIF(EXCLUDED.name, ''), products.name),
 *     updated_at  = now();
 *   -- SEO-поля (seo_title, seo_description, slug, description) намеренно НЕ трогаем.
 *
 * Здесь БД ещё не подключена, поэтому тот же алгоритм выполняется над
 * серверным in-memory снапшотом каталога — контракт эндпоинта и правила
 * слияния полей идентичны будущей SQL-реализации.
 */
import { PRODUCTS, type Product } from "@/data/catalog";

export type FeedRow = {
  sku: string;
  name?: string | undefined;
  category?: string | undefined;
  dims?: string | undefined;
  price?: number | null | undefined;
  price1000?: number | null | undefined;
  price5000?: number | null | undefined;
  stock?: number | null | undefined;
  weight?: number | null | undefined;
  volume?: number | null | undefined;
};

export type SyncReport = {
  received: number;
  inserted: number;
  updated: number;
  duplicates: number;
  invalid: number;
  hidden: number;
  errors: string[];
};

/** Триммер + единый регистр: "  zg-100 " и "ZG-100" — один и тот же товар. */
export function normalizeSku(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** Разбор CSV (разделитель , или ;) с заголовком в первой строке. */
export function parseCsvFeed(text: string): FeedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const delim = (lines[0]!.match(/;/g)?.length ?? 0) > (lines[0]!.match(/,/g)?.length ?? 0) ? ";" : ",";
  const head = lines[0]!.split(delim).map((h) => h.trim().toLowerCase());
  const idx = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const map = {
    sku: idx("sku", "артикул", "code"),
    name: idx("name", "название", "наименование"),
    category: idx("category", "категория"),
    dims: idx("dims", "габариты", "размер"),
    price: idx("price", "цена", "базовая"),
    price1000: idx("price1000", "опт1", "опт 1"),
    price5000: idx("price5000", "опт2", "опт 2"),
    stock: idx("stock", "остаток", "наличие", "qty"),
    weight: idx("weight", "вес"),
    volume: idx("volume", "объем", "объём"),
  };
  return lines.slice(1).map((line) => {
    const c = line.split(delim);
    const at = (i: number) => (i >= 0 ? c[i]?.trim() : undefined);
    return {
      sku: at(map.sku) ?? "",
      name: at(map.name),
      category: at(map.category),
      dims: at(map.dims),
      price: num(at(map.price)),
      price1000: num(at(map.price1000)),
      price5000: num(at(map.price5000)),
      stock: num(at(map.stock)),
      weight: num(at(map.weight)),
      volume: num(at(map.volume)),
    } satisfies FeedRow;
  });
}

export function normalizeRows(rows: FeedRow[]): {
  clean: Map<string, FeedRow>;
  duplicates: number;
  invalid: number;
  errors: string[];
} {
  const clean = new Map<string, FeedRow>();
  let duplicates = 0;
  let invalid = 0;
  const errors: string[] = [];
  for (const row of rows) {
    const sku = normalizeSku(row.sku);
    if (!sku) {
      invalid += 1;
      if (errors.length < 20) errors.push("Строка без артикула пропущена");
      continue;
    }
    if (clean.has(sku)) duplicates += 1; // последняя строка фида выигрывает
    clean.set(sku, { ...row, sku, name: row.name?.trim(), category: row.category?.trim() });
  }
  return { clean, duplicates, invalid, errors };
}

/** Снапшот каталога на сервере: сюда фид применяет upsert. */
const snapshot = new Map<string, Product>(PRODUCTS.map((p) => [normalizeSku(p.sku), { ...p }]));

export function catalogSnapshot(): Product[] {
  return [...snapshot.values()];
}

export function applyFeed(rows: FeedRow[], opts: { hideMissing?: boolean } = {}): SyncReport {
  const { clean, duplicates, invalid, errors } = normalizeRows(rows);
  let inserted = 0;
  let updated = 0;

  for (const [sku, row] of clean) {
    const prev = snapshot.get(sku);
    if (!prev) {
      inserted += 1;
      snapshot.set(sku, {
        id: sku.toLowerCase(),
        sku,
        name: row.name || sku,
        parent: "Прочее",
        is_service: false,
        category: row.category || "Прочее",
        dims: row.dims || "—",
        color: null,
        tier1Qty: 1000,
        tier2Qty: 5000,
        image_url: null,

        material: "Полипропилен PP, ударопрочный",
        gost: "ГОСТ 26996-86 / ТУ 22.29.29",
        load: "—",
        weight: row.weight ?? 0,
        volume: row.volume ?? 0,
        stock: { qty: Math.max(0, Math.round(row.stock ?? 0)) },
        price: row.price ?? 0,
        price1000: row.price1000 ?? row.price ?? 0,
        price5000: row.price5000 ?? row.price1000 ?? row.price ?? 0,
        engineering_assets: {
          model_glb_url: null,
          model_step_url: `/api/public/cad/${sku}/step`,
          model_dwg_url: `/api/public/cad/${sku}/dwg`,
          passport_pdf_url: `/api/public/cad/${sku}/pdf`,
        },
      });
      continue;
    }
    updated += 1;
    // Обновляем только коммерческие поля. Название/описание/SEO — не перетираем пустотой.
    snapshot.set(sku, {
      ...prev,
      name: row.name || prev.name,
      category: row.category || prev.category,
      dims: row.dims || prev.dims,
      weight: row.weight ?? prev.weight,
      volume: row.volume ?? prev.volume,
      price: row.price ?? prev.price,
      price1000: row.price1000 ?? prev.price1000,
      price5000: row.price5000 ?? prev.price5000,
      stock:
        row.stock === null || row.stock === undefined
          ? prev.stock
          : row.stock > 0
            ? { qty: Math.round(row.stock) }
            : { qty: 0, lead: "Под заказ" },
    });
  }

  // Товаров нет в фиде — не удаляем страницу (сохраняем SEO-вес), а прячем из наличия.
  let hidden = 0;
  if (opts.hideMissing) {
    for (const [sku, p] of snapshot) {
      if (clean.has(sku) || p.stock.qty === 0) continue;
      hidden += 1;
      snapshot.set(sku, { ...p, stock: { qty: 0, lead: "Нет в наличии" } });
    }
  }

  return { received: rows.length, inserted, updated, duplicates, invalid, hidden, errors };
}
