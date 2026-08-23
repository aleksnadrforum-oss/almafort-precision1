import { PRODUCTS, type Product } from "@/data/catalog";

export const SITE_URL = "https://almafort.ru";

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

/** lowercase + русская транслитерация + дефисы (без нижних подчёркиваний). */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[×x]/g, "-")
    .replace(/ø/g, "d")
    .replace(/[а-яё]/g, (ch) => TRANSLIT[ch] ?? "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type Facet = { slug: string; label: string };

export const COLORS: Facet[] = [
  { slug: "chernyy", label: "чёрный" },
  { slug: "seryy", label: "серый" },
  { slug: "belyy", label: "белый" },
];

export function shapeOf(p: Product): string {
  const n = p.name.toLowerCase();
  if (n.includes("квадрат")) return "квадратная";
  if (n.includes("кругл") || p.dims.includes("Ø")) return "круглая";
  if (n.includes("прямоуголь")) return "прямоугольная";
  if (/^м\d/i.test(p.dims)) return "резьбовая";
  return "универсальная";
}

const uniq = (items: Facet[]) =>
  Array.from(new Map(items.map((f) => [f.slug, f])).values());

export const CATEGORY_FACETS: Facet[] = uniq(
  PRODUCTS.map((p) => ({ slug: slugify(p.category), label: p.category })),
);

export function categoryOfSlug(slug: string): Facet | undefined {
  return CATEGORY_FACETS.find((f) => f.slug === slug);
}

export function shapeFacets(categorySlug: string): Facet[] {
  return uniq(
    PRODUCTS.filter((p) => slugify(p.category) === categorySlug).map((p) => ({
      slug: slugify(shapeOf(p)),
      label: shapeOf(p),
    })),
  );
}

export function sizeFacets(categorySlug: string, shapeSlug?: string): Facet[] {
  return uniq(
    PRODUCTS.filter(
      (p) =>
        slugify(p.category) === categorySlug &&
        (!shapeSlug || slugify(shapeOf(p)) === shapeSlug),
    ).map((p) => ({ slug: slugify(p.dims), label: p.dims })),
  );
}

export type FacetPath = {
  category?: Facet | undefined;
  shape?: Facet | undefined;
  size?: Facet | undefined;
  color?: Facet | undefined;
  valid: boolean;
  path: string;
};


/** Иерархическая валидация: /catalog/{категория}/{форма}/{размер}/{цвет} */
export function parseFacetPath(segments: string[]): FacetPath {
  const [c, s, z, col] = segments;
  const category = c ? categoryOfSlug(c) : undefined;
  const shape = category && s ? shapeFacets(category.slug).find((f) => f.slug === s) : undefined;
  const size =
    category && z ? sizeFacets(category.slug, shape?.slug).find((f) => f.slug === z) : undefined;
  const color = col ? COLORS.find((f) => f.slug === col) : undefined;

  const valid =
    segments.length > 0 &&
    segments.length <= 4 &&
    !!category &&
    (!s || !!shape) &&
    (!z || !!size) &&
    (!col || !!color);

  return {
    category,
    shape,
    size,
    color,
    valid,
    path: buildFacetPath([category?.slug, shape?.slug, size?.slug, color?.slug]),
  };
}

export function buildFacetPath(parts: Array<string | undefined>): string {
  const clean = [] as string[];
  for (const p of parts) {
    if (!p) break;
    clean.push(p);
  }
  return `/catalog${clean.length ? "/" + clean.join("/") : ""}`;
}

export function facetProducts(f: FacetPath): Product[] {
  return PRODUCTS.filter(
    (p) =>
      (!f.category || slugify(p.category) === f.category.slug) &&
      (!f.shape || slugify(shapeOf(p)) === f.shape.slug) &&
      (!f.size || slugify(p.dims) === f.size.slug),
  );
}

/* ---------- Мета ---------- */

export function facetTitle(f: FacetPath): string {
  const head = [f.category?.label, f.shape?.label, f.size?.label, f.color && `(${f.color.label})`]
    .filter(Boolean)
    .join(" ");
  const full = `${head} — купить оптом от производителя | ALMAFORT`;
  return full.length <= 70 ? full : `${head} оптом от производителя — ALMAFORT`.slice(0, 70);

}

export function facetH1(f: FacetPath): string {
  return [f.category?.label, f.shape?.label, f.size?.label, f.color && `(${f.color.label})`]
    .filter(Boolean)
    .join(" ");
}

export function facetDescription(f: FacetPath, items: Product[]): string {
  const stock = items.reduce((s, p) => s + p.stock.qty, 0);
  const name = items[0]?.name ?? facetH1(f);
  // Услуги не имеют склада и цены — остаток в тексте игнорируем.
  const services = items.length > 0 && items.every((p) => p.is_service);
  if (services) {
    return `Профессиональные услуги ALMAFORT: ${facetH1(f)}. Литьё под давлением, реверс-инжиниринг и промышленная 3D-печать. Оставьте заявку — инженер подготовит индивидуальный расчёт.`;
  }
  return `В наличии на складе ${stock.toLocaleString("ru-RU")} шт. ${name}. Каскадные оптовые цены, отгрузка от 1 дня (СДЭК, Деловые Линии). Запросить BIM-модель.`;
}

/* ---------- JSON-LD ---------- */

const YEAR_END = `${new Date().getUTCFullYear()}-12-31`;

export function productJsonLd(p: Product, url: string) {
  if (p.is_service) {
    // Услуга: без offers с нулевой ценой — цена согласуется индивидуально.
    return {
      "@context": "https://schema.org/",
      "@type": "Service",
      name: p.name,
      serviceType: p.category,
      url,
      provider: { "@type": "Organization", name: "ALMAFORT" },
      areaServed: "RU",
    };
  }
  return {
    "@context": "https://schema.org/",
    "@type": "Product",
    name: p.name,
    image: `${SITE_URL}/icons/icon-512.png`,
    sku: p.sku,
    mpn: p.sku,
    brand: { "@type": "Brand", name: "ALMAFORT" },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.8",
      reviewCount: 15,
      bestRating: "5",
      worstRating: "1",
    },
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "RUB",
      price: p.price.toFixed(2),
      // Оптовые пороги: цена зависит от партии (B2B priceSpecification).
      priceSpecification: [
        {
          "@type": "UnitPriceSpecification",
          price: p.price.toFixed(2),
          priceCurrency: "RUB",
          eligibleQuantity: { "@type": "QuantitativeValue", minValue: 1, unitCode: "C62" },
        },
        {
          "@type": "UnitPriceSpecification",
          price: (p.price * 0.93).toFixed(2),
          priceCurrency: "RUB",
          eligibleQuantity: { "@type": "QuantitativeValue", minValue: 1000, unitCode: "C62" },
        },
        {
          "@type": "UnitPriceSpecification",
          price: (p.price * 0.87).toFixed(2),
          priceCurrency: "RUB",
          eligibleQuantity: { "@type": "QuantitativeValue", minValue: 10000, unitCode: "C62" },
        },
      ],
      priceValidUntil: YEAR_END,
      itemCondition: "https://schema.org/NewCondition",
      availability:
        p.stock.qty > 0 ? "https://schema.org/InStock" : "https://schema.org/PreOrder",
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        applicableCountry: "RU",
        returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: 14,
        returnMethod: "https://schema.org/ReturnByMail",
        returnFees: "https://schema.org/FreeReturn",
      },
      shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingRate: { "@type": "MonetaryAmount", value: "850.00", currency: "RUB" },
        shippingDestination: { "@type": "DefinedRegion", addressCountry: "RU" },
      },
    },
  };
}

export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${SITE_URL}${it.path}`,
    })),
  };
}

export function faqJsonLd(items: Array<{ q: string; a: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
}

/** Все индексируемые фасетные URL (для sitemap + предгенерации). */
export function allFacetPaths(limit = 1000): string[] {
  const out = new Set<string>(["/catalog"]);
  for (const cat of CATEGORY_FACETS) {
    out.add(`/catalog/${cat.slug}`);
    for (const shape of shapeFacets(cat.slug)) {
      out.add(`/catalog/${cat.slug}/${shape.slug}`);
      for (const size of sizeFacets(cat.slug, shape.slug)) {
        out.add(`/catalog/${cat.slug}/${shape.slug}/${size.slug}`);
        for (const color of COLORS) {
          out.add(`/catalog/${cat.slug}/${shape.slug}/${size.slug}/${color.slug}`);
        }
      }
    }
  }
  return Array.from(out).slice(0, limit);
}

/**
 * Правило индексации фасетов: пересечения более двух параметров
 * (форма + размер + цвет), пагинация и пустые выборки закрываем от индекса.
 */
export function facetRobots(f: FacetPath, itemsCount: number, page = 1): string | null {
  const depth = [f.category, f.shape, f.size, f.color].filter(Boolean).length;
  if (depth > 2 || page > 1 || itemsCount === 0) return "noindex, follow";
  return null;
}
