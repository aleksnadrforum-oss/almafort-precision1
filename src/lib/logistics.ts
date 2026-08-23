/**
 * Общие типы и константы логистики ALMAFORT (клиент + сервер).
 * Магистраль Дивногорск → терминалы Красноярска ALMAFORT берёт на себя,
 * поэтому Origin у всех ТК зафиксирован на Красноярск, отправка «от терминала».
 */

export type CarrierId = "cdek" | "dl" | "pickup";

export type ShippingQuote = {
  carrier: Exclude<CarrierId, "pickup">;
  label: string;
  price: number;
  days: number;
  /** true — доставка до двери, false — выдача на терминале ТК */
  toDoor: boolean;
  /** Источник тарифа: живой API оператора или расчётная тарифная модель */
  source: "api" | "model";
};

export type Destination = { city: string; fiasId: string | null };

export type Parcel = { totalWeight: number; totalVolume: number };

/** Защита от дурака: минимальная коробка, если в карточке SKU нет ТТХ. */
export const FALLBACK_WEIGHT_KG = 0.1;
export const FALLBACK_VOLUME_M3 = 0.001;

/** Точка сдачи груза на терминалы ТК. */
export const ORIGIN = {
  city: "Красноярск",
  fiasId: "93b3df57-4c89-44df-ac42-96f05e9cd3b9",
  cdekCityCode: 278,
  dlTerminalId: "krsk-terminal",
  fromDoor: false,
} as const;

export const CARRIER_LABEL: Record<CarrierId, string> = {
  cdek: "СДЭК",
  dl: "Деловые Линии",
  pickup: "Самовывоз",
};

export function sanitizeParcel(p: Partial<Parcel> | undefined): Parcel {
  const w = Number(p?.totalWeight);
  const v = Number(p?.totalVolume);
  return {
    totalWeight: Number.isFinite(w) && w > 0 ? Math.min(w, 20000) : FALLBACK_WEIGHT_KG,
    totalVolume: Number.isFinite(v) && v > 0 ? Math.min(v, 120) : FALLBACK_VOLUME_M3,
  };
}
