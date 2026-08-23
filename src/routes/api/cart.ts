import { createFileRoute } from "@tanstack/react-router";
import { rateLimit } from "@/lib/rate-limit.server";
import { PRODUCTS, tierOf } from "@/data/catalog";
import { lineTotal, unitPriceOf } from "@/lib/pricing";

/** Добавление позиции в заказ. Цена считается только на сервере. */
export const Route = createFileRoute("/api/cart")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const limited = rateLimit(request, "cart", { limit: 60, windowMs: 60_000 });
        if (limited) return limited;
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Некорректный запрос" }, { status: 400 });
        }
        const { sku, quantity } = (body ?? {}) as { sku?: unknown; quantity?: unknown };
        const qty = Number(quantity);

        if (typeof sku !== "string" || !Number.isFinite(qty) || qty < 1 || qty > 1_000_000) {
          return Response.json({ error: "Укажите артикул и количество" }, { status: 400 });
        }

        const product = PRODUCTS.find((p) => p.sku === sku);
        if (!product) return Response.json({ error: "Артикул не найден" }, { status: 404 });

        const quantityInt = Math.floor(qty);
        return Response.json({
          ok: true,
          sku: product.sku,
          name: product.name,
          quantity: quantityInt,
          tier: tierOf(quantityInt, product),
          unitPrice: unitPriceOf(product, quantityInt),
          sum: lineTotal(product, quantityInt),
        });
      },
    },
  },
});
