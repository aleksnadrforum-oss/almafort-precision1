// Снимок последнего заказа для экрана /success (корзина к тому моменту уже очищена).
import type { CartLine, Carrier } from "@/store/cart-store";

export type LastOrder = {
  orderId: string;
  lines: CartLine[];
  carrier: Carrier;
  city: string;
  delivery: number;
  total: number;
  invoiceUrl: string | null;
};

const KEY = "almafort:last-order";

export function saveLastOrder(order: LastOrder) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(order));
  } catch {
    /* приватный режим — просто пропускаем */
  }
}

export function readLastOrder(): LastOrder | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LastOrder) : null;
  } catch {
    return null;
  }
}
