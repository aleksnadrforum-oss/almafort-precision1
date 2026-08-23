import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const schema = z.object({
  rows: z
    .array(
      z.object({
        sku: z.string().trim().min(1).max(64),
        stock: z.number().min(0).max(10_000_000).optional(),
        base_price: z.number().min(0).max(10_000_000).optional(),
        opt1_price: z.number().min(0).max(10_000_000).optional(),
        opt2_price: z.number().min(0).max(10_000_000).optional(),
      }),
    )
    .min(1)
    .max(5000),
});

/**
 * 1С → сайт: ночная выгрузка складских остатков и цен.
 * Колонка «Наличие» в каталоге обновляется из этих данных.
 */
export const Route = createFileRoute("/api/public/erp/stock")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { secretValue } = await import("@/lib/vault.server");
        const token = await secretValue("ERP_1C_TOKEN");
        if (!token || request.headers.get("X-Almafort-Erp-Token") !== token) {
          return new Response("Unauthorized", { status: 401 });
        }

        let rows: z.infer<typeof schema>["rows"];
        try {
          rows = schema.parse(await request.json()).rows;
        } catch {
          return Response.json({ error: "Некорректная выгрузка" }, { status: 400 });
        }

        const { applyStockFeed } = await import("@/lib/erp-1c.server");
        const result = await applyStockFeed(rows);
        return Response.json({ ok: true, ...result });
      },
    },
  },
});
