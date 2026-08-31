/**
 * Микроразметка Schema.org для каталога.
 *
 * Роботы не исполняют модалки и клиентский стейт, поэтому Product/Offer
 * отдаются структурировано прямо в разметке страницы каталога.
 * Цвета НЕ порождают отдельные товары: они уходят в свойство `color`
 * вариаций, а canonical всегда указывает на базовый URL категории.
 */
import type { Product } from "@/data/catalog";
import { isOnRequest } from "@/data/catalog";

export const SITE_ORIGIN = "https://almafort.ru";

/** Чистый текст: без HTML-тегов, схлопнутые пробелы, безопасная длина. */
export function plainText(input: string, limit = 480) {
  const text = input
    .replace(/<[^>]*>/g, " ")
    .replace(/[#*_>`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}

export type JsonLdColor = { label: string; hex: string };

export function productJsonLd(
  p: Product,
  opts: { description?: string; colors?: JsonLdColor[] } = {},
) {
  const url = `${SITE_ORIGIN}/catalog`;
  const availability =
    p.stock.qty > 0 ? "https://schema.org/InStock" : "https://schema.org/PreOrder";

  const offers = isOnRequest(p)
    ? [
        {
          "@type": "Offer",
          url,
          priceCurrency: "RUB",
          availability,
          priceSpecification: {
            "@type": "PriceSpecification",
            priceCurrency: "RUB",
            valueAddedTaxIncluded: true,
          },
          eligibleQuantity: { "@type": "QuantitativeValue", unitCode: "C62" },
        },
      ]
    : [
        {
          "@type": "Offer",
          name: "Базовая цена",
          url,
          price: p.price,
          priceCurrency: "RUB",
          availability,
          eligibleQuantity: { "@type": "QuantitativeValue", value: 1, unitCode: "C62" },
        },
        {
          "@type": "Offer",
          name: "Опт 1",
          url,
          price: p.price1000,
          priceCurrency: "RUB",
          availability,
          eligibleQuantity: {
            "@type": "QuantitativeValue",
            minValue: p.tier1Qty,
            unitCode: "C62",
          },
        },
        {
          "@type": "Offer",
          name: "Опт 2",
          url,
          price: p.price5000,
          priceCurrency: "RUB",
          availability,
          eligibleQuantity: {
            "@type": "QuantitativeValue",
            minValue: p.tier2Qty,
            unitCode: "C62",
          },
        },
      ];

  const colors = opts.colors ?? [];

  return {
    "@type": "Product",
    "@id": `${url}#${p.sku}`,
    name: p.name,
    sku: p.sku,
    mpn: p.sku,
    category: `${p.parent} / ${p.category}`,
    url,
    ...(p.image_url ? { image: [p.image_url] } : {}),
    description: plainText(
      opts.description ?? `${p.name}. Габариты: ${p.dims}. Материал: ${p.material}.`,
    ),
    brand: { "@type": "Brand", name: "ALMAFORT" },
    material: p.material,
    ...(colors.length ? { color: colors.map((c) => c.label) } : p.color ? { color: p.color } : {}),
    ...(p.weight > 0
      ? { weight: { "@type": "QuantitativeValue", value: p.weight, unitCode: "KGM" } }
      : {}),
    ...(colors.length > 1
      ? {
          hasVariant: colors.map((c) => ({
            "@type": "Product",
            name: `${p.name} — ${c.label}`,
            sku: p.sku,
            color: c.label,
            url,
          })),
        }
      : {}),
    offers,
  };
}

/** Список товаров каталога одним графом — меньше шума, чем N отдельных тегов. */
export function catalogJsonLd(
  items: Array<{ product: Product; description?: string; colors?: JsonLdColor[] }>,
) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ItemList",
        name: "Каталог ALMAFORT",
        url: `${SITE_ORIGIN}/catalog`,
        numberOfItems: items.length,
        itemListElement: items.map((it, i) => ({
          "@type": "ListItem",
          position: i + 1,
          item: productJsonLd(it.product, {
            ...(it.description ? { description: it.description } : {}),
            ...(it.colors ? { colors: it.colors } : {}),
          }),
        })),
      },
    ],
  };
}

/** Рендерит структурированные данные тегом application/ld+json. */
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      // Данные формируются на нашей стороне из типизированного каталога.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
