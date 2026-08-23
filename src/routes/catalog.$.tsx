import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { isOnRequest, type Product } from "@/data/catalog";
import { BackLink } from "@/components/back-link";
import { QuoteRequestModal } from "@/components/catalog/quote-request-modal";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { formatPrice } from "@/lib/pricing";
import {
  breadcrumbJsonLd,
  COLORS,
  facetDescription,
  facetH1,
  facetProducts,
  facetRobots,
  facetTitle,
  parseFacetPath,
  productJsonLd,
  shapeFacets,
  SITE_URL,
  sizeFacets,
  slugify,
} from "@/lib/seo";

type Search = { page?: number | undefined; sort?: string | undefined; utm_source?: string | undefined };

export const Route = createFileRoute("/catalog/$")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    page: search['page'] ? Number(search['page']) : undefined,
    sort: typeof search['sort'] === "string" ? search['sort'] : undefined,
    utm_source: typeof search['utm_source'] === "string" ? search['utm_source'] : undefined,
  }),
  loader: ({ params }): { facets: ReturnType<typeof parseFacetPath>; items: Product[] } => {
    const segments = (params._splat ?? "").split("/").filter(Boolean);
    const facets = parseFacetPath(segments);
    if (!facets.valid) throw notFound();
    const items = facetProducts(facets);
    return { facets, items };
  },
  head: ({ loaderData, match }) => {
    if (!loaderData) {
      return { meta: [{ title: "Раздел не найден — ALMAFORT" }, { name: "robots", content: "noindex" }] };
    }
    const { facets, items } = loaderData;
    const page = Math.max(1, Number((match.search as Search).page ?? 1) || 1);
    const base = facetTitle(facets);
    // Уникализируем Title страниц пагинации.
    const title = page > 1 ? `${base} — страница ${page}` : base;
    const description =
      page > 1
        ? `${facetH1(facets)}: страница ${page} каталога ALMAFORT. Оптовые цены и остатки склада.`
        : facetDescription(facets, items);
    // Канонический URL — всегда чистый путь без ?sort / ?utm_source / ?gclid / ?page
    const canonical = `${SITE_URL}${facets.path}`;
    const robots = facetRobots(facets, items.length, page);
    // Соцкарточка конкретной позиции, если раздел сузился до одного артикула.
    const single = items.length === 1 ? items[0] : undefined;
    const image =
      single && !single.is_service
        ? `${SITE_URL}/icons/icon-512.png`
        : `${SITE_URL}/icons/icon-512.png`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        ...(robots ? [{ name: "robots", content: robots }] : []),
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "product.group" },
        { property: "og:url", content: canonical },
        { property: "og:image", content: image },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: image },
      ],
      links: [{ rel: "canonical", href: canonical }],
    };
  },
  component: FacetPage,
  notFoundComponent: FacetNotFound,
});

function FacetNotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="w-full flex-1 mx-auto max-w-[900px] px-5 py-24 text-center">
        <h1 className="text-3xl font-extrabold text-foreground">Раздел каталога не найден</h1>
        <p className="mt-3 text-muted-foreground">
          Проверьте адрес или вернитесь в общий каталог.
        </p>
        <Link to="/catalog" className="mt-6 inline-block font-semibold text-primary">
          Перейти в каталог →
        </Link>
      </main>
    </div>
  );
}

function FacetRow({ p }: { p: Product }) {
  const [quote, setQuote] = useState(false);
  const onRequest = isOnRequest(p) || p.is_service;

  return (
    <li className="flex flex-wrap items-center gap-4 px-5 py-4">
      <span className="w-[110px] shrink-0 font-mono text-xs text-muted-foreground">{p.sku}</span>
      <span className="min-w-[220px] flex-1 text-sm font-semibold text-foreground">{p.name}</span>
      <span className="w-[120px] text-sm tabular-nums text-muted-foreground">{p.dims}</span>
      <span className="w-[140px] text-sm tabular-nums text-muted-foreground">
        {p.is_service ? "Под заказ" : p.stock.qty > 0 ? `${p.stock.qty.toLocaleString("ru-RU")} шт` : p.stock.lead}
      </span>
      <span className="w-[170px] text-right text-sm font-bold tabular-nums text-foreground">
        {onRequest ? (
          <span className="inline-block whitespace-nowrap rounded-sm bg-[#F3F4F6] px-2 py-1 text-[11px] font-semibold text-muted-foreground">
            По договоренности
          </span>
        ) : (
          formatPrice(p.price)
        )}
      </span>
      {onRequest && (
        <button
          type="button"
          onClick={() => setQuote(true)}
          className="rounded-[4px] border border-border px-3 py-2 text-xs font-semibold text-foreground transition-colors duration-200 hover:border-primary hover:text-primary"
        >
          Запросить расчет
        </button>
      )}
      {quote && <QuoteRequestModal sku={p.sku} name={p.name} onClose={() => setQuote(false)} />}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            productJsonLd(p, `${SITE_URL}/catalog/${slugify(p.category)}/${p.sku.toLowerCase()}`),
          ),
        }}
      />
    </li>
  );
}

function FacetPage() {
  const { facets, items } = Route.useLoaderData() as {
    facets: ReturnType<typeof parseFacetPath>;
    items: Product[];
  };
  const crumbs = [
    { name: "Главная", path: "/" },
    { name: "Каталог", path: "/catalog" },
    ...(facets.category ? [{ name: facets.category.label, path: `/catalog/${facets.category.slug}` }] : []),
    ...(facets.shape && facets.category
      ? [{ name: facets.shape.label, path: `/catalog/${facets.category.slug}/${facets.shape.slug}` }]
      : []),
    ...(facets.size && facets.category && facets.shape
      ? [
          {
            name: facets.size.label,
            path: `/catalog/${facets.category.slug}/${facets.shape.slug}/${facets.size.slug}`,
          },
        ]
      : []),
  ];

  const childShapes = facets.category && !facets.shape ? shapeFacets(facets.category.slug) : [];
  const childSizes =
    facets.category && facets.shape && !facets.size
      ? sizeFacets(facets.category.slug, facets.shape.slug)
      : [];
  const childColors = facets.size && !facets.color ? COLORS : [];
  const page = Math.max(1, Number(Route.useSearch().page ?? 1) || 1);
  const base = facets.path;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="w-full flex-1 mx-auto max-w-[1200px] px-5 pb-24 pt-10 lg:px-10">
        <nav aria-label="Хлебные крошки" className="mb-6 text-xs text-muted-foreground">
          {crumbs.map((c, i) => (
            <span key={c.path}>
              {i > 0 && <span className="mx-2 text-border">/</span>}
              {i === crumbs.length - 1 ? (
                <span className="text-foreground">{c.name}</span>
              ) : (
                <a href={c.path} className="hover:text-primary">
                  {c.name}
                </a>
              )}
            </span>
          ))}
        </nav>

        <BackLink fallback="/catalog" className="mb-3" />

        <h1 className="text-3xl font-extrabold leading-[1.1] tracking-tight text-foreground lg:text-[40px]">
          {facetH1(facets)}
        </h1>
        {page === 1 && (
          <p className="mt-3 max-w-[70ch] text-sm leading-[1.6] text-muted-foreground">
            {facetDescription(facets, items)}
          </p>
        )}

        {(childShapes.length > 0 || childSizes.length > 0 || childColors.length > 0) && (
          <div className="mt-8 flex flex-wrap gap-2">
            {[...childShapes, ...childSizes, ...childColors].map((f) => (
              <a
                key={f.slug}
                href={`${base}/${f.slug}`}
                className="rounded-sm border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors duration-200 hover:border-primary hover:text-primary"
              >
                {f.label}
              </a>
            ))}
          </div>
        )}

        {items.length === 0 && (
          <section className="mt-10 rounded-sm border border-border bg-card p-6" style={{ minHeight: 200 }}>
            <h2 className="text-lg font-bold text-foreground">Позиции временно отсутствуют</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Раздел пуст — посмотрите родительскую категорию или закажите изготовление партии.
            </p>
            <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
              <a className="text-primary" href={facets.category ? `/catalog/${facets.category.slug}` : "/catalog"}>
                ← В родительскую категорию
              </a>
              <a className="text-primary" href="/catalog">Весь каталог</a>
            </div>
          </section>
        )}

        <section className="mt-10" style={{ minHeight: 320 }} aria-label="Позиции раздела">
          <ul className="divide-y divide-border rounded-sm border border-border bg-card">
            {items.map((p) => (
              <FacetRow key={p.sku} p={p} />
            ))}
          </ul>
        </section>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd(crumbs)) }}
        />
      </main>
      <SiteFooter />
    </div>
  );
}
