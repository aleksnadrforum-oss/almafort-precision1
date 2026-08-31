import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { PRODUCTS, tierOf, unitPrice } from "@/data/catalog";
import type { Candidate } from "@/lib/spec-matcher";
import {
  FALLBACK_VOLUME_M3,
  FALLBACK_WEIGHT_KG,
  type CarrierId,
  type ShippingQuote,
} from "@/lib/logistics";

export type CartLine = {
  sku: string;
  name: string;
  quantity: number;
  /** Как строка называлась в исходной спецификации клиента */
  originalName?: string | undefined;
  /** Выбранный в карточке цвет детали (название + HEX). */
  color?: { label: string; hex: string } | undefined;
};

/** Строка спецификации, требующая участия человека (жёлтая / красная). */
export type PendingRow = {
  id: string;
  originalString: string;
  quantity: number;
  status: "AMBIGUOUS" | "NOT_FOUND";
  score: number;
  candidates: Candidate[];
};

export type Carrier = CarrierId;

export type ParsePayload = {
  fileName?: string;
  rows: Array<{
    id?: string;
    originalString: string;
    quantity: number;
    status: "MATCHED" | "AMBIGUOUS" | "NOT_FOUND";
    score: number;
    sku: string | null;
    candidates: Candidate[];
  }>;
};

/**
 * Композитный ключ строки: артикул + цвет.
 * Один и тот же SKU разных цветов — разные независимые строки корзины.
 */
export const lineKey = (l: { sku: string; color?: { label: string } | null | undefined }) =>
  `${l.sku}::${l.color?.label ?? ""}`;

export const productBySku = (sku: string) => PRODUCTS.find((p) => p.sku === sku);

/**
 * Потолок заказа по артикулу. Склад общий для всех цветов SKU.
 * qty = 0 при наличии срока поставки — позиция «под заказ», лимита нет.
 */
export const stockLimit = (sku: string): number => {
  const p = productBySku(sku);
  if (!p) return Number.POSITIVE_INFINITY;
  if (p.is_service) return Number.POSITIVE_INFINITY;
  if (p.stock.qty > 0) return p.stock.qty;
  return p.stock.lead ? Number.POSITIVE_INFINITY : 0;
};

/** Есть ли жёсткий складской лимит у позиции. */
export const hasStockLimit = (sku: string) => Number.isFinite(stockLimit(sku));

/** Сумма всех цветов артикула в корзине (можно исключить конкретную строку). */
export const skuInCart = (
  lines: Array<{ sku: string; quantity: number; color?: { label: string } | null | undefined }>,
  sku: string,
  excludeKey?: string,
) =>
  lines.reduce(
    (a, l) => (l.sku === sku && lineKey(l) !== excludeKey ? a + l.quantity : a),
    0,
  );

/** Сколько ещё можно добавить по артикулу с учётом уже набранных цветов. */
export const availableFor = (
  lines: Array<{ sku: string; quantity: number; color?: { label: string } | null | undefined }>,
  sku: string,
  excludeKey?: string,
) => {
  const limit = stockLimit(sku);
  if (!Number.isFinite(limit)) return limit;
  return Math.max(0, limit - skuInCart(lines, sku, excludeKey));
};


/**
 * Чистая функция каскадных скидок.
 * minColumn — «пол» ценовой колонки от грейда лояльности: Опт 1 / Опт 2
 * закрепляются за партнёром на любой объём.
 */
export function linePrice(sku: string, qty: number, minColumn: 0 | 1 | 2 = 0) {
  const p = productBySku(sku);
  if (!p) return { base: 0, unit: 0, tier: 0 as 0 | 1 | 2, sum: 0 };
  const tier = Math.max(tierOf(qty, p), minColumn) as 0 | 1 | 2;
  const unit = tier === 2 ? p.price5000 : tier === 1 ? p.price1000 : unitPrice(p, qty);
  const q = Math.max(0, Math.floor(qty));
  // Деньги считаем в копейках — исключает артефакты плавающей точки.
  const sum = Math.round(unit * 100) * q / 100;
  return { base: p.price, unit, tier, sum: Number(sum.toFixed(2)) };
}

/** Агрегация партии на лету: сумма, вес и объём с защитой от нулевых ТТХ. */
export function cartTotals(lines: CartLine[], minColumn: 0 | 1 | 2 = 0) {
  let goods = 0;
  let weight = 0;
  let volume = 0;
  for (const l of lines) {
    const p = productBySku(l.sku);
    goods += linePrice(l.sku, l.quantity, minColumn).sum;
    weight += (p?.weight && p.weight > 0 ? p.weight : FALLBACK_WEIGHT_KG) * l.quantity;
    volume += (p?.volume && p.volume > 0 ? p.volume : FALLBACK_VOLUME_M3) * l.quantity;
  }
  return {
    goods,
    weight: Number(weight.toFixed(3)),
    volume: Number(volume.toFixed(4)),
  };
}

export type Quote = ShippingQuote;

/** Локальный фолбэк, если сервис расчёта недоступен. */
export function deliveryCost(carrier: Carrier, weight: number) {
  if (carrier === "pickup" || weight <= 0) return 0;
  const base = carrier === "cdek" ? 690 : 1250;
  return Math.round(base + weight * (carrier === "cdek" ? 32 : 18));
}

/** Строка экрана предпросмотра импорта (до попадания в корзину). */
export type ReviewRow = {
  id: string;
  originalString: string;
  quantity: number;
  status: "MATCHED" | "AMBIGUOUS" | "NOT_FOUND" | "NEEDS_SIZE" | "ERROR";
  score: number;
  sku: string | null;
  name: string | null;
  notes: string[];
  error: string | null;
  candidates: Candidate[];
};

export type ReviewState = {
  fileName: string;
  truncated: boolean;
  columnMap: { sheet: string; sku: string | null; name: string | null; qty: string | null } | null;
  rows: ReviewRow[];
};

type State = {
  fileName: string | null;
  /** ИНН организации-владельца корзины (Shared Cart). */
  organizationId: string | null;
  /** Сотрудник, удерживающий блокировку редактирования спецификации. */
  lockedBy: string | null;
  parsing: boolean;
  lines: CartLine[];
  pending: PendingRow[];
  review: ReviewState | null;
  carrier: Carrier;
  city: string;
  fiasId: string | null;
  quotes: Quote[];
  quoting: boolean;
  quoteError: string | null;
  setQuotes: (q: Quote[]) => void;
  setQuoting: (v: boolean) => void;
  setQuoteError: (e: string | null) => void;
  setParsing: (v: boolean) => void;
  bindOrganization: (organizationId: string | null, userId: string | null) => void;
  applyParse: (payload: ParsePayload) => void;
  setReview: (r: ReviewState | null) => void;
  /** Переносит подтверждённые строки предпросмотра в корзину. */
  commitReview: (
    rows: Array<{ sku: string; quantity: number; originalName?: string }>,
    mode: "merge" | "replace",
  ) => void;
  addLine: (
    sku: string,
    quantity: number,
    originalName?: string,
    color?: { label: string; hex: string },
  ) => void;
  /** Применяет корзину, слитую на сервере при входе в кабинет. */
  applyMergedLines: (rows: Array<{ sku: string; quantity: number }>) => void;
  setQuantity: (key: string, quantity: number) => void;
  removeLine: (key: string) => void;
  resolvePending: (id: string, sku: string) => void;
  removePending: (id: string) => void;
  setCarrier: (c: Carrier) => void;
  setCity: (c: string) => void;
  setDestination: (city: string, fiasId: string | null) => void;
  clear: () => void;
};

const uid = () => Math.random().toString(36).slice(2, 10);

export const useCart = create<State>()(
  persist(
    (set) => ({
  fileName: null,
  organizationId: null,
  lockedBy: null,
  parsing: false,
  lines: [],
  pending: [],
  review: null,
  carrier: "cdek",
  city: "",
  fiasId: null,
  quotes: [],
  quoting: false,
  quoteError: null,

  setReview: (review) => set({ review, parsing: false, fileName: review?.fileName ?? null }),

  commitReview: (rows, mode) =>
    set((s) => {
      const lines: CartLine[] = mode === "replace" ? [] : s.lines.map((l) => ({ ...l }));
      for (const r of rows) {
        const p = productBySku(r.sku);
        if (!p) continue;
        const qty = Math.max(1, Math.floor(r.quantity));
        const found = lines.find((l) => l.sku === p.sku);
        // Дубли артикулов из Excel складываются, а не плодят строки.
        if (found) found.quantity += qty;
        else lines.push({ sku: p.sku, name: p.name, quantity: qty, originalName: r.originalName });
      }
      return { lines, review: null, parsing: false };
    }),

  setQuotes: (quotes) => set({ quotes, quoteError: null }),
  setQuoting: (quoting) => set({ quoting }),
  setQuoteError: (quoteError) => set({ quoteError, quotes: [] }),

  setParsing: (v) => set({ parsing: v }),

  bindOrganization: (organizationId, userId) =>
    set((s) => ({
      organizationId,
      // Блокировку держит первый вошедший сотрудник организации.
      lockedBy: organizationId ? (s.lockedBy ?? userId) : null,
    })),

  applyParse: (payload) =>
    set((s) => {
      const lines = [...s.lines];
      const pending: PendingRow[] = [...s.pending];
      for (const r of payload.rows) {
        if (r.status === "MATCHED" && r.sku) {
          const p = productBySku(r.sku);
          if (p) {
            const found = lines.find((l) => l.sku === p.sku);
            if (found) found.quantity += r.quantity;
            else
              lines.push({
                sku: p.sku,
                name: p.name,
                quantity: r.quantity,
                originalName: r.originalString,
              });
            continue;
          }
        }
        pending.push({
          id: r.id ?? uid(),
          originalString: r.originalString,
          quantity: r.quantity,
          status: r.status === "MATCHED" ? "NOT_FOUND" : r.status,
          score: r.score,
          candidates: r.candidates ?? [],
        });
      }
      return {
        fileName: payload.fileName ?? s.fileName,
        parsing: false,
        lines,
        pending,
      };
    }),

  addLine: (sku, quantity, originalName, color) =>
    set((s) => {
      const p = productBySku(sku);
      const qty = Math.max(1, Math.floor(Number(quantity) || 0));
      if (!p) return s;
      const next: CartLine = { sku, name: p.name, quantity: qty, originalName, color };
      const key = lineKey(next);
      // Остаток общий на артикул: свободный объём = склад − уже набранное всеми цветами.
      const free = availableFor(s.lines, sku);
      if (free <= 0) return s;
      const add = Math.min(qty, free);
      next.quantity = add;
      // Совпадение только по паре «артикул + цвет»; иначе — новая строка.
      const lines = s.lines.map((l) => (lineKey(l) === key ? { ...l, quantity: l.quantity + add } : l));
      if (!s.lines.some((l) => lineKey(l) === key)) lines.push(next);
      return { lines };
    }),

  applyMergedLines: (rows) =>
    set(() => ({
      lines: rows
        .map((r) => {
          const p = productBySku(r.sku);
          return p ? { sku: r.sku, name: p.name, quantity: Math.max(1, Math.floor(r.quantity)) } : null;
        })
        .filter((l): l is CartLine => Boolean(l)),
    })),

  setQuantity: (key, quantity) =>
    set((s) => ({
      lines: s.lines.map((l) => {
        if (lineKey(l) !== key) return l;
        const wanted = Math.min(9_999_999, Math.max(1, Math.floor(Number(quantity) || 1)));
        // Жёсткий потолок: остаток артикула минус то, что занято другими цветами.
        const cap = Math.max(1, availableFor(s.lines, l.sku, key));
        return { ...l, quantity: Math.min(wanted, cap) };
      }),
    })),


  removeLine: (key) => set((s) => ({ lines: s.lines.filter((l) => lineKey(l) !== key) })),

  resolvePending: (id, sku) =>
    set((s) => {
      const row = s.pending.find((x) => x.id === id);
      const p = productBySku(sku);
      if (!row || !p) return s;
      const lines = [...s.lines];
      const found = lines.find((l) => l.sku === p.sku);
      if (found) found.quantity += row.quantity;
      else
        lines.push({
          sku: p.sku,
          name: p.name,
          quantity: row.quantity,
          originalName: row.originalString,
        });
      return { lines, pending: s.pending.filter((x) => x.id !== id) };
    }),

  removePending: (id) => set((s) => ({ pending: s.pending.filter((x) => x.id !== id) })),

  setCarrier: (carrier) => set({ carrier }),
  setCity: (city) => set({ city, fiasId: null }),
  setDestination: (city, fiasId) => set({ city, fiasId }),

  clear: () =>
    set({ lines: [], pending: [], review: null, fileName: null, quotes: [], quoteError: null, fiasId: null }),
    }),
    {
      // Корзина переживает переход между страницами и закрытие вкладки.
      name: "almafort:cart:v5",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        lines: s.lines,
        organizationId: s.organizationId,
        lockedBy: s.lockedBy,
        pending: s.pending,
        review: s.review,
        fileName: s.fileName,
        carrier: s.carrier,
        city: s.city,
        fiasId: s.fiasId,
      }),
    },
  ),
);
