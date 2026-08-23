// Денежная арифметика в копейках — исключает ошибки плавающей точки (0.1 + 0.2).
import { tierOf, type Product } from "@/data/catalog";

export const toKopecks = (rub: number) => Math.round(rub * 100);
export const toRubles = (kop: number) => kop / 100;

/** Цена за единицу с учётом тира партии. */
export function unitPriceOf(p: Product, qty: number) {
  const t = tierOf(qty, p);
  const rub = t === 2 ? p.price5000 : t === 1 ? p.price1000 : p.price;
  return toRubles(toKopecks(rub));
}

/** Сумма строки: считаем в копейках, округляем один раз. */
export function lineTotal(p: Product, qty: number) {
  return toRubles(toKopecks(unitPriceOf(p, qty)) * Math.max(0, Math.floor(qty)));
}

export const formatMoney = (v: number) =>
  v.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Единый валютный форматтер платформы: «4,00 ₽» с неразрывным пробелом. */
export const formatPrice = (v: number | null | undefined) =>
  v === null || v === undefined || Number.isNaN(v)
    ? "По договоренности"
    : new Intl.NumberFormat("ru-RU", {
        style: "currency",
        currency: "RUB",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(v);

