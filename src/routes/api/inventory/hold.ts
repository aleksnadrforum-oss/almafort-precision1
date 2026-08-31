import { createFileRoute } from "@tanstack/react-router";
import { rateLimit } from "@/lib/rate-limit.server";
import { PRODUCTS, isOnRequest } from "@/data/catalog";

/**
 * Холд остатков под спецификацию.
 *
 * «В корзине» и «Зарезервировано» — разные сущности: корзина локальна,
 * а холд замораживает склад на 24 часа под конкретную организацию (ИНН).
 * Если объёма физически нет — отвечаем 409 со списком дефицита, чтобы
 * фронт заблокировал генерацию PDF до корректировки количеств.
 */

const HOLD_TTL_MS = 24 * 60 * 60 * 1000;

type HoldItem = { sku: string; quantity: number };

export const Route = createFileRoute("/api/inventory/hold")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const limited = rateLimit(request, "inventory-hold", { limit: 30, windowMs: 60_000 });
        if (limited) return limited;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Некорректный запрос" }, { status: 400 });
        }

        const { items, organizationId, lockedBy } = (body ?? {}) as {
          items?: unknown;
          organizationId?: unknown;
          lockedBy?: unknown;
        };
        if (!Array.isArray(items) || items.length === 0) {
          return Response.json({ error: "Пустая спецификация" }, { status: 400 });
        }

        const normalized: HoldItem[] = [];
        for (const raw of items) {
          const { sku, quantity } = (raw ?? {}) as { sku?: unknown; quantity?: unknown };
          const qty = Math.floor(Number(quantity));
          if (typeof sku !== "string" || !Number.isFinite(qty) || qty < 1) {
            return Response.json({ error: "Некорректная строка спецификации" }, { status: 400 });
          }
          normalized.push({ sku, quantity: Math.min(qty, 9_999_999) });
        }

        const shortages: Array<{ sku: string; requested: number; available: number }> = [];
        for (const item of normalized) {
          const p = PRODUCTS.find((x) => x.sku === item.sku);
          if (!p || isOnRequest(p)) continue; // услуги и позиции «по запросу» склад не резервируют
          const available = Math.max(0, p.stock.qty);
          if (available < item.quantity) {
            shortages.push({ sku: item.sku, requested: item.quantity, available });
          }
        }

        if (shortages.length > 0) {
          return Response.json(
            { ok: false, reason: "insufficient_stock", shortages },
            { status: 409 },
          );
        }

        const expiresAt = Date.now() + HOLD_TTL_MS;
        return Response.json({
          ok: true,
          holdId: `HOLD-${Date.now().toString(36).toUpperCase()}`,
          organizationId: typeof organizationId === "string" ? organizationId : null,
          lockedBy: typeof lockedBy === "string" ? lockedBy : null,
          expiresAt,
          items: normalized,
        });
      },
    },
  },
});
