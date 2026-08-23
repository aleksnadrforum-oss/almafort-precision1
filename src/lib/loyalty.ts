/**
 * B2B-лояльность ALMAFORT: не баллы, а финансовые грейды.
 * Грейд считается по сумме оплаченных/отгруженных заказов за 12 месяцев
 * и «намертво» закрепляет за клиентом оптовую колонку прайса (Модуль 3).
 */

export type LoyaltyTier = 1 | 2 | 3;

export type LoyaltySummary = {
  total_spent: number;
  tier: LoyaltyTier;
  next_threshold: number | null;
};

export const TIER_META: Record<
  LoyaltyTier,
  {
    name: string;
    /** Минимальная ценовая колонка каталога: 0 — базовая, 1 — Опт 1, 2 — Опт 2 */
    minColumn: 0 | 1 | 2;
    perks: string[];
    /** Отсрочка платежа */
    credit: boolean;
  }
> = {
  1: {
    name: "Базовый партнёр",
    minColumn: 0,
    perks: ["Стандартная матрица цен", "Скидки по объёму конкретной партии"],
    credit: false,
  },
  2: {
    name: "Оптовый партнёр",
    minColumn: 1,
    perks: ["Колонка «Опт 1» на любой объём", "Приоритет комплектации"],
    credit: false,
  },
  3: {
    name: "Стратегический партнёр",
    minColumn: 2,
    perks: [
      "Колонка «Опт 2» на любой объём",
      "Отсрочка платежа 15–30 дней",
      "Приоритетная очередь на 3D-печать и реверс-инжиниринг",
    ],
    credit: true,
  },
};

export const EMPTY_LOYALTY: LoyaltySummary = { total_spent: 0, tier: 1, next_threshold: 500_000 };

/** Прогресс до следующего грейда, 0..1. */
export function tierProgress(s: LoyaltySummary) {
  if (!s.next_threshold) return 1;
  const floor = s.tier === 2 ? 500_000 : 0;
  return Math.min(1, Math.max(0, (s.total_spent - floor) / (s.next_threshold - floor)));
}

export const STAGES = [
  { id: "awaiting_payment", icon: "🔴", title: "Ожидает оплаты" },
  { id: "paid", icon: "🟡", title: "Оплата получена" },
  { id: "production", icon: "⚙️", title: "В производстве" },
  { id: "packing", icon: "📦", title: "Комплектация и ОТК" },
  { id: "shipped", icon: "🚚", title: "Передан в транспортную компанию" },
  { id: "arrived", icon: "📍", title: "Прибыл в терминал назначения" },
  { id: "closed", icon: "✅", title: "Сделка закрыта" },
] as const;

export type StageId = (typeof STAGES)[number]["id"];

export const stageIndex = (id: string) => STAGES.findIndex((s) => s.id === id);
