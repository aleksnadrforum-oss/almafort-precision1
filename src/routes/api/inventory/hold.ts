import { createFileRoute } from "@tanstack/react-router";
import { rateLimit } from "@/lib/rate-limit.server";
import { createHold, HOLD_TTL_MS } from "@/lib/inventory.server";

/**
 * Холд остатков под счёт.
 *
 * «В корзине» и «Зарезервировано» — разные сущности: корзина локальна и
 * публичные остатки не меняет, холд создаётся только при выпуске счёта и
 * живёт TTL (72 часа). Гость без подтверждённого ИНН резерв не создаёт —
 * ему доступно только коммерческое предложение (estimate).
 */

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

        const { items, organizationId, lockedBy, verified } = (body ?? {}) as {
          items?: unknown;
          organizationId?: unknown;
          lockedBy?: unknown;
          verified?: unknown;
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

        const inn = typeof organizationId === "string" ? organizationId.replace(/\D/g, "") : "";
        // Подтверждённым считаем аккаунт с корректным ИНН (10/12 цифр) и признаком верификации.
        const innOk = inn.length === 10 || inn.length === 12;
        if (!innOk) {
          return Response.json(
            {
              ok: false,
              reason: "unverified",
              error:
                "Резерв склада доступен после подтверждения ИНН. Сейчас можно скачать коммерческое предложение без брони остатков",
            },
            { status: 403 },
          );
        }

        const result = await createHold({
          items: normalized,
          organizationId: inn,
          lockedBy: typeof lockedBy === "string" ? lockedBy : null,
          verified: verified === true,
        });

        if (!result.ok && result.reason === "ceiling_exceeded") {
          return Response.json(
            {
              ok: false,
              reason: "ceiling_exceeded",
              shortages: result.shortages,
              error:
                "Для бронирования оптовой партии такого объёма требуется ручное подтверждение менеджера",
            },
            { status: 409 },
          );
        }

        if (!result.ok) {
          return Response.json(
            { ok: false, reason: "insufficient_stock", shortages: result.shortages },
            { status: 409 },
          );
        }

        return Response.json({
          ok: true,
          holdId: result.holdId,
          organizationId: inn,
          lockedBy: typeof lockedBy === "string" ? lockedBy : null,
          expiresAt: result.expiresAt,
          ttlMs: HOLD_TTL_MS,
          items: result.items,
        });
      },
    },
  },
});
