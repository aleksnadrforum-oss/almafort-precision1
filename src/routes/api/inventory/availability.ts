import { createFileRoute } from "@tanstack/react-router";
import { rateLimit } from "@/lib/rate-limit.server";
import { stockSnapshot } from "@/lib/inventory.server";

/**
 * Публичные остатки каталога.
 * Наружу отдаём только availableStock = physicalStock − reservedStock.
 */
export const Route = createFileRoute("/api/inventory/availability")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const limited = rateLimit(request, "inventory-availability", {
          limit: 120,
          windowMs: 60_000,
        });
        if (limited) return limited;

        const url = new URL(request.url);
        const skus = (url.searchParams.get("skus") ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 500);
        if (skus.length === 0) return Response.json({ availability: {} });

        const snapshots = await stockSnapshot(skus);
        const availability: Record<string, number | null> = {};
        for (const s of snapshots) availability[s.sku] = s.unlimited ? null : s.availableStock;
        return Response.json({ availability });
      },
    },
  },
});
