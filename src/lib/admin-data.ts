/**
 * Чистые (client-safe) данные и вычисления админки: матрица товаров,
 * пересчёт спецификации и парсер CSV массового обновления.
 */
import { PRODUCTS, tierOf, type Product } from "@/data/catalog";

export type AdminOrderItem = {
  sku: string;
  name: string;
  quantity: number;
  unit: number;
  sum: number;
};

export type ProductOverrideRow = {
  sku: string;
  base_price: number | null;
  opt1_price: number | null;
  opt2_price: number | null;
  stock: number | null;
  image_url?: string | null;
  model_url?: string | null;
  synonyms?: string[];
  hidden?: boolean;
};

export const VAULT_GROUPS = [
  "Валидация и данные",
  "Искусственный интеллект",
  "Синхронизация с 1С (ERP)",
  "Логистика",
  "Инфраструктура и документы",
  "Пользовательские интеграции",
] as const;

/** Группа для ключей, добавленных владельцем бизнеса без участия разработчика. */
export const VAULT_CUSTOM_GROUP = "Пользовательские интеграции";

export type VaultGroup = (typeof VAULT_GROUPS)[number];

/** Полный реестр внешних шлюзов. Значения хранятся только зашифрованными. */
export const VAULT_KEYS = [
  { name: "DADATA_API_KEY", label: "DaData API Token", group: "Валидация и данные" },
  { name: "DADATA_SECRET_KEY", label: "DaData Secret Key", group: "Валидация и данные" },
  { name: "OPENAI_API_KEY", label: "OpenAI / Anthropic API Key", group: "Искусственный интеллект" },
  { name: "ERP_1C_URL", label: "1C Endpoint URL", group: "Синхронизация с 1С (ERP)" },
  { name: "ERP_1C_LOGIN", label: "1C API Login", group: "Синхронизация с 1С (ERP)" },
  { name: "ERP_1C_PASSWORD", label: "1C API Password", group: "Синхронизация с 1С (ERP)" },
  { name: "ERP_1C_TOKEN", label: "Токен вебхуков 1С → сайт", group: "Синхронизация с 1С (ERP)" },
  { name: "CDEK_ACCOUNT", label: "CDEK Account (логин)", group: "Логистика" },
  { name: "CDEK_SECURE_PASSWORD", label: "CDEK Secure Password", group: "Логистика" },
  { name: "DL_API_KEY", label: "Dellin API AppKey", group: "Логистика" },
  { name: "S3_ACCESS_KEY_ID", label: "S3 Access Key", group: "Инфраструктура и документы" },
  { name: "S3_SECRET_ACCESS_KEY", label: "S3 Secret Key", group: "Инфраструктура и документы" },
  { name: "SMTP_HOST", label: "SMTP сервер", group: "Инфраструктура и документы" },
  { name: "SMTP_USER", label: "SMTP логин", group: "Инфраструктура и документы" },
  { name: "SMTP_PASSWORD", label: "SMTP пароль", group: "Инфраструктура и документы" },
] as const satisfies ReadonlyArray<{ name: string; label: string; group: VaultGroup }>;


const bySku = new Map(PRODUCTS.map((p) => [p.sku, p]));

/** Актуальная цена позиции с учётом переопределения из БД. */
export function effectivePrices(p: Product, o?: ProductOverrideRow) {
  return {
    base: o?.base_price ?? p.price,
    opt1: o?.opt1_price ?? p.price1000,
    opt2: o?.opt2_price ?? p.price5000,
  };
}

export function buildProductMatrix(overrides: ProductOverrideRow[]) {
  const map = new Map(overrides.map((o) => [o.sku, o]));
  return PRODUCTS.map((p) => {
    const o = map.get(p.sku);
    const prices = effectivePrices(p, o);
    return {
      sku: p.sku,
      name: p.name,
      parent: p.parent,
      category: p.category,
      is_service: p.is_service,
      base_price: prices.base,
      opt1_price: prices.opt1,
      opt2_price: prices.opt2,
      stock: o?.stock ?? p.stock.qty,
      image_url: o?.image_url ?? p.image_url ?? null,
      model_url: o?.model_url ?? p.engineering_assets.model_glb_url ?? null,
      synonyms: o?.synonyms ?? [],
      hidden: o?.hidden ?? false,
      overridden: Boolean(o),
    };
  });
}

export type ProductMatrixRow = ReturnType<typeof buildProductMatrix>[number];

/** Пересчёт спецификации заказа по действующей матрице цен. */
export function priceItems(items: Array<{ sku: string; quantity: number }>) {
  const out: AdminOrderItem[] = [];
  let goods = 0;
  for (const it of items) {
    const p = bySku.get(it.sku);
    if (!p) continue;
    const qty = Math.max(1, Math.floor(it.quantity));
    const tier = tierOf(qty, p);
    const unit = p.is_service ? 0 : tier === 2 ? p.price5000 : tier === 1 ? p.price1000 : p.price;
    const sum = Math.round(unit * 100) * qty / 100;
    goods += sum;
    out.push({ sku: p.sku, name: p.name, quantity: qty, unit, sum });
  }
  return { items: out, goods: Math.round(goods * 100) / 100 };
}

const REQUIRED_COLUMNS = ["sku", "base_price", "opt1_price", "opt2_price", "stock"];

/** Парсер CSV массового обновления с валидацией колонок и значений. */
export function parseProductCsv(csv: string): { rows: ProductOverrideRow[]; errors: string[] } {
  const errors: string[] = [];
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return { rows: [], errors: ["Файл пуст или содержит только заголовок"] };

  const delimiter = (lines[0]!.match(/;/g)?.length ?? 0) > (lines[0]!.match(/,/g)?.length ?? 0) ? ";" : ",";
  const header = lines[0]!.split(delimiter).map((h) => h.trim().toLowerCase());
  for (const col of REQUIRED_COLUMNS) {
    if (!header.includes(col)) errors.push(`Отсутствует колонка «${col}»`);
  }
  if (errors.length) return { rows: [], errors };

  const idx = (name: string) => header.indexOf(name);
  const rows: ProductOverrideRow[] = [];
  lines.slice(1).forEach((line, i) => {
    const cells = line.split(delimiter).map((c) => c.trim());
    const sku = cells[idx("sku")] ?? "";
    if (!sku) return;
    if (!bySku.has(sku)) {
      errors.push(`Строка ${i + 2}: артикул «${sku}» отсутствует в каталоге`);
      return;
    }
    const num = (name: string) => {
      const raw = cells[idx(name)];
      if (raw === undefined || raw === "") return null;
      const v = Number(raw.replace(",", "."));
      if (!Number.isFinite(v) || v < 0) {
        errors.push(`Строка ${i + 2}: некорректное значение «${name}» = «${raw}»`);
        return null;
      }
      return v;
    };
    const synRaw = idx("synonyms") >= 0 ? cells[idx("synonyms")] : "";
    rows.push({
      sku,
      base_price: num("base_price"),
      opt1_price: num("opt1_price"),
      opt2_price: num("opt2_price"),
      stock: num("stock") === null ? null : Math.round(num("stock")!),
      synonyms: synRaw ? synRaw.split("|").map((s) => s.trim()).filter(Boolean) : [],
    });
  });
  if (!rows.length && !errors.length) errors.push("Не найдено ни одной валидной строки");
  return { rows, errors };
}
