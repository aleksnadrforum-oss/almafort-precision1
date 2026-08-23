import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { CATEGORY_FACETS, SITE_URL } from "@/lib/seo";
import { xmlUrlset } from "@/lib/sitemap";

export const Route = createFileRoute("/sitemap-categories.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries = [
          { loc: `${SITE_URL}/`, changefreq: "weekly", priority: "1.0" },
          { loc: `${SITE_URL}/catalog`, changefreq: "daily", priority: "0.9" },
          ...CATEGORY_FACETS.map((c) => ({
            loc: `${SITE_URL}/catalog/${c.slug}`,
            changefreq: "daily",
            priority: "0.8",
          })),
        ];
        return xmlUrlset(entries);
      },
    },
  },
});
