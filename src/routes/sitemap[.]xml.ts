import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { allFacetPaths, SITE_URL } from "@/lib/seo";

const LIMIT = 50000;

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const total = allFacetPaths(LIMIT).length + 1;
        const shards = ["/sitemap-categories.xml"];
        const pages = Math.max(1, Math.ceil(total / LIMIT));
        for (let i = 1; i <= pages; i++) shards.push(`/sitemap-products/${i}.xml`);

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...shards.map((s) => `  <sitemap>\n    <loc>${SITE_URL}${s}</loc>\n  </sitemap>`),
          `</sitemapindex>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
