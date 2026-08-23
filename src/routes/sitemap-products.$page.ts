import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { allFacetPaths, SITE_URL } from "@/lib/seo";
import { xmlUrlset } from "@/lib/sitemap";

const LIMIT = 50000;

export const Route = createFileRoute("/sitemap-products/$page")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const page = Math.max(1, parseInt(String(params.page).replace(/\.xml$/, ""), 10) || 1);
        const all = allFacetPaths(LIMIT * 10);
        const slice = all.slice((page - 1) * LIMIT, page * LIMIT);
        if (slice.length === 0) return new Response("Not found", { status: 404 });
        return xmlUrlset(
          slice.map((path) => ({
            loc: `${SITE_URL}${path}`,
            changefreq: "daily",
            priority: "0.6",
          })),
        );
      },
    },
  },
});
