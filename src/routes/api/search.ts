import { createFileRoute } from "@tanstack/react-router";
import { rateLimit } from "@/lib/rate-limit.server";
import { searchCatalog } from "@/lib/search-index";

/**
 * Drop-down поиск каталога. Отдаёт только лёгкий массив полей
 * (id, sku, title, category, dimensions, price, stock_quantity) — без тяжёлых связей,
 * чтобы держать latency < 50 мс.
 */
export const Route = createFileRoute("/api/search")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const limited = rateLimit(request, "search", { limit: 120, windowMs: 60_000 });
        if (limited) return limited;
        const started = Date.now();
        const url = new URL(request.url);
        const q = (url.searchParams.get("q") ?? "").slice(0, 120);
        const limitRaw = Number(url.searchParams.get("limit") ?? 8);
        const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 25) : 8;

        if (q.trim().length < 3) {
          return Response.json({ hits: [], took: 0 });
        }

        const hits = searchCatalog(q, limit);
        return Response.json(
          { hits, took: Date.now() - started },
          { headers: { "Cache-Control": "public, max-age=30" } },
        );
      },
    },
  },
});
