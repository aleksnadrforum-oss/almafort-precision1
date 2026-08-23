// Невидимый аналитический слой: события Яндекс.Метрики.
// Менеджмент видит, какие артикулы проектировщики закладывают в чертежи.

declare global {
  interface Window {
    ym?: (id: number, action: string, target: string, params?: Record<string, unknown>) => void;
    dataLayer?: Array<Record<string, unknown>>;
  }
}

const COUNTER_ID = Number(import.meta.env["VITE_YM_COUNTER_ID"] ?? 0);

export function reachGoal(goal: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    if (COUNTER_ID && typeof window.ym === "function") {
      window.ym(COUNTER_ID, "reachGoal", goal, params);
    }
    window.dataLayer = window.dataLayer ?? [];
    window.dataLayer.push({ event: goal, ...params });
  } catch {
    /* аналитика не должна ломать скачивание */
  }
}

export function trackCadDownload(sku: string, format: "step" | "dwg" | "pdf" | "glb") {
  reachGoal("cad_download", { sku, format });
  reachGoal(`cad_download_${format}`, { sku });
}

/* ────────────── E-commerce dataLayer (Яндекс.Метрика / GA4-совместимый) ────────────── */

export type EcomItem = {
  sku: string;
  name: string;
  price: number;
  quantity?: number;
};

const toGoods = (items: EcomItem[]) =>
  items.map((i) => ({
    id: i.sku,
    name: i.name,
    price: i.price,
    quantity: i.quantity ?? 1,
    brand: "ALMAFORT",
  }));

/** Общий пуш в dataLayer в формате Метрики: ecommerce.{action}.products. */
function ecommerce(action: "detail" | "add" | "remove" | "purchase", items: EcomItem[], extra?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    window.dataLayer = window.dataLayer ?? [];
    window.dataLayer.push({
      ecommerce: {
        currencyCode: "RUB",
        [action]: { products: toGoods(items), ...(extra ?? {}) },
      },
    });
  } catch {
    /* аналитика не должна ломать заказ */
  }
}

export function trackViewItem(item: EcomItem) {
  ecommerce("detail", [item]);
  reachGoal("view_item", { sku: item.sku, price: item.price });
}

export function trackAddToCart(item: EcomItem) {
  ecommerce("add", [item]);
  reachGoal("add_to_cart", { sku: item.sku, quantity: item.quantity ?? 1, price: item.price });
}

export function trackRemoveFromCart(item: EcomItem) {
  ecommerce("remove", [item]);
  reachGoal("remove_from_cart", { sku: item.sku });
}

export function trackBeginCheckout(items: EcomItem[], total: number) {
  reachGoal("begin_checkout", { total, positions: items.length });
}

export function trackPurchase(orderId: string | number, items: EcomItem[], total: number) {
  ecommerce("purchase", items, { actionField: { id: String(orderId), revenue: total } });
  reachGoal("purchase", { order_id: String(orderId), total, positions: items.length });
}

/** Микроконверсии: клик по телефону/почте, копирование контакта, скачивание прайса. */
export function trackContact(kind: "phone_click" | "email_click" | "phone_copy" | "price_download" | "presentation_download") {
  reachGoal(kind);
}
