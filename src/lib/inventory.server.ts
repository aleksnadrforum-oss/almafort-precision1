/**
 * Управление остатками ALMAFORT (защита от Inventory Exhaustion).
 *
 * Три метрики вместо одной цифры:
 *   physicalStock  — физически на складе;
 *   reservedStock  — сумма активных холдов под выставленные, но не оплаченные счета;
 *   availableStock — physicalStock − reservedStock (единственное, что видит фронт).
 *
 * Корзина — это намерение (draft) и склад не трогает. Холд создаётся только
 * в момент выпуска счёта, живёт TTL и автоматически истекает.
 */
import { PRODUCTS, isOnRequest } from "@/data/catalog";
import { db } from "@/lib/db.server";

/** Срок жизни резерва под B2B-счёт. */
export const HOLD_TTL_MS = 72 * 60 * 60 * 1000;

/** Потолок брони для неверифицированного/нового аккаунта — доля от стока позиции. */
export const NEW_ACCOUNT_CEILING = 0.4;

export type HoldRow = {
  id: string;
  sku: string;
  quantity: number;
  organization_id: string | null;
  locked_by: string | null;
  status: "active" | "expired" | "released" | "fulfilled";
  expires_at: string;
  created_at?: string;
};

export type StockSnapshot = {
  sku: string;
  physicalStock: number;
  reservedStock: number;
  availableStock: number;
  /** Позиция без складского лимита (услуга или «под заказ»). */
  unlimited: boolean;
};

const productOf = (sku: string) => PRODUCTS.find((p) => p.sku === sku);

/** Физический остаток: приоритет у ручного оверрайда из админки. */
async function physicalStockMap(skus: string[]): Promise<Map<string, number | null>> {
  const map = new Map<string, number | null>();
  for (const sku of skus) {
    const p = productOf(sku);
    if (!p || p.is_service || isOnRequest(p)) {
      map.set(sku, null); // null = лимита нет
      continue;
    }
    if (p.stock.qty <= 0 && p.stock.lead) {
      map.set(sku, null);
      continue;
    }
    map.set(sku, Math.max(0, p.stock.qty));
  }
  try {
    const { data } = await db.from("product_overrides").select("*").in("sku", skus);
    for (const row of (data ?? []) as Array<{ sku: string; stock?: number | null }>) {
      if (typeof row.stock === "number" && Number.isFinite(row.stock)) {
        map.set(row.sku, Math.max(0, Math.floor(row.stock)));
      }
    }
  } catch {
    /* оверрайды недоступны — работаем по каталогу */
  }
  return map;
}

/** Ленивое истечение: просроченные холды возвращают товар в пул. */
export async function expireStaleHolds(): Promise<number> {
  const nowIso = new Date().toISOString();
  const { data } = await db.from("inventory_holds").select("*").eq("status", "active");
  const stale = ((data ?? []) as HoldRow[]).filter((h) => String(h.expires_at) <= nowIso);
  for (const hold of stale) {
    await db.from("inventory_holds").update({ status: "expired" }).eq("id", hold.id);
  }
  return stale.length;
}

/** Сумма активных резервов по артикулам. */
export async function reservedMap(skus?: string[]): Promise<Map<string, number>> {
  await expireStaleHolds();
  const { data } = await db.from("inventory_holds").select("*").eq("status", "active");
  const map = new Map<string, number>();
  for (const hold of (data ?? []) as HoldRow[]) {
    if (skus && !skus.includes(hold.sku)) continue;
    map.set(hold.sku, (map.get(hold.sku) ?? 0) + Math.max(0, Number(hold.quantity) || 0));
  }
  return map;
}

/** Снимок остатков: то, что уходит на фронт. */
export async function stockSnapshot(skus: string[]): Promise<StockSnapshot[]> {
  const unique = [...new Set(skus.filter((s) => typeof s === "string" && s))];
  const [physical, reserved] = await Promise.all([physicalStockMap(unique), reservedMap(unique)]);
  return unique.map((sku) => {
    const phys = physical.get(sku) ?? null;
    const res = reserved.get(sku) ?? 0;
    if (phys === null) {
      return { sku, physicalStock: 0, reservedStock: res, availableStock: 0, unlimited: true };
    }
    return {
      sku,
      physicalStock: phys,
      reservedStock: res,
      availableStock: Math.max(0, phys - res),
      unlimited: false,
    };
  });
}

export type HoldRequestItem = { sku: string; quantity: number };

export type HoldResult =
  | { ok: true; holdId: string; expiresAt: number; items: HoldRequestItem[] }
  | {
      ok: false;
      reason: "insufficient_stock";
      shortages: Array<{ sku: string; requested: number; available: number }>;
    }
  | {
      ok: false;
      reason: "ceiling_exceeded";
      shortages: Array<{ sku: string; requested: number; available: number }>;
    };

/**
 * Создание резерва под счёт.
 * verified=false → действует ceiling-лимит на долю стока одной позиции.
 */
export async function createHold(opts: {
  items: HoldRequestItem[];
  organizationId: string | null;
  lockedBy: string | null;
  verified: boolean;
}): Promise<HoldResult> {
  const snapshots = await stockSnapshot(opts.items.map((i) => i.sku));
  const bySku = new Map(snapshots.map((s) => [s.sku, s]));

  const shortages: Array<{ sku: string; requested: number; available: number }> = [];
  const ceilingHits: Array<{ sku: string; requested: number; available: number }> = [];

  for (const item of opts.items) {
    const snap = bySku.get(item.sku);
    if (!snap || snap.unlimited) continue; // услуги и «под заказ» склад не резервируют
    if (snap.availableStock < item.quantity) {
      shortages.push({ sku: item.sku, requested: item.quantity, available: snap.availableStock });
      continue;
    }
    if (!opts.verified) {
      const ceiling = Math.floor(snap.physicalStock * NEW_ACCOUNT_CEILING);
      if (item.quantity > ceiling) {
        ceilingHits.push({ sku: item.sku, requested: item.quantity, available: ceiling });
      }
    }
  }

  if (shortages.length > 0) return { ok: false, reason: "insufficient_stock", shortages };
  if (ceilingHits.length > 0)
    return { ok: false, reason: "ceiling_exceeded", shortages: ceilingHits };

  const holdId = `HOLD-${Date.now().toString(36).toUpperCase()}`;
  const expiresAt = Date.now() + HOLD_TTL_MS;
  const expiresIso = new Date(expiresAt).toISOString();

  for (const item of opts.items) {
    const snap = bySku.get(item.sku);
    if (!snap || snap.unlimited) continue;
    await db.from("inventory_holds").insert({
      hold_id: holdId,
      sku: item.sku,
      quantity: item.quantity,
      organization_id: opts.organizationId,
      locked_by: opts.lockedBy,
      status: "active",
      expires_at: expiresIso,
    });
  }

  return { ok: true, holdId, expiresAt, items: opts.items };
}

/** Снятие резерва (отмена счёта или ручной релиз менеджером). */
export async function releaseHold(holdId: string): Promise<void> {
  await db.from("inventory_holds").update({ status: "released" }).eq("hold_id", holdId);
}
