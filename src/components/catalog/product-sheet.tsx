import { useEffect, useMemo, useState, type ComponentType } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { createClientOnlyFn } from "@tanstack/react-start";
import { Download, FileText, Layers, Ruler, Truck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Product } from "@/data/catalog";
import { trackCadDownload, trackViewItem } from "@/lib/metrika";
import { CityInput, type CityValue } from "@/components/cart/city-input";
import { BulkRequestDialog } from "@/components/catalog/bulk-request-dialog";
import { useAssetGroups } from "@/lib/asset-groups";
import { useDebounce } from "@/hooks/use-debounce";
import type { ShippingQuote } from "@/lib/logistics";
type CadViewerProps = { glbUrl: string | null; category: string };

const loadCadViewer = createClientOnlyFn(async () => {
  const module = await import("@/components/catalog/cad-viewer");
  return module.default as ComponentType<CadViewerProps>;
});

export function ProductSheet({
  product,
  onClose,
}: {
  product: Product | null;
  onClose: () => void;
}) {
  const [city, setCity] = useState<CityValue>({ city: "Москва", fiasId: null });
  const [batch, setBatch] = useState(1000);
  const [quotes, setQuotes] = useState<ShippingQuote[]>([]);
  const [calcState, setCalcState] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const assets = useAssetGroups();
  const assetGroup = product ? assets.get(product.sku) : undefined;
  const [bulkOpen, setBulkOpen] = useState(false);
  const [CadViewer, setCadViewer] = useState<ComponentType<CadViewerProps> | null>(null);

  useEffect(() => {
    let active = true;
    void loadCadViewer().then((Viewer) => {
      if (active) setCadViewer(() => Viewer);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!product) return;
    trackViewItem({ sku: product.sku, name: product.name, price: product.price });
  }, [product]);

  const debouncedCity = useDebounce(city.city, 600);

  const parcel = useMemo(
    () => ({
      totalWeight: +((product?.weight ?? 0) * batch).toFixed(3),
      totalVolume: +((product?.volume ?? 0) * batch).toFixed(4),
    }),
    [product, batch],
  );

  useEffect(() => {
    const dest = debouncedCity.trim();
    if (!product || dest.length < 2) {
      setQuotes([]);
      setCalcState("idle");
      return;
    }
    setQuotes([]);
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setCalcState("failed");
      return;
    }
    setCalcState("loading");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    (async () => {
      try {
        const res = await fetch("/api/shipping-calc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            destination: { city: dest, fias_id: city.fiasId },
            parcel,
          }),
          signal: ctrl.signal,
        });
        const json = (await res.json()) as { quotes?: ShippingQuote[] };
        if (!res.ok || !json.quotes?.length) throw new Error("no quotes");
        setQuotes(json.quotes);
        setCalcState("ready");
      } catch {
        setCalcState("failed");
      } finally {
        clearTimeout(timer);
      }
    })();
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [debouncedCity, city.fiasId, parcel, product]);

  const logistics = quotes;

  const jsonLd = product
    ? {
        "@context": "https://schema.org",
        "@type": "Product",
        name: product.name,
        sku: product.sku,
        category: `Каталог/${product.category}`,
        material: product.material,
        weight: { "@type": "QuantitativeValue", value: product.weight, unitCode: "KGM" },
        offers: {
          "@type": "Offer",
          price: product.price,
          priceCurrency: "RUB",
          validFrom: "2026-01-01",
          availability:
            product.stock.qty > 0
              ? "https://schema.org/InStock"
              : "https://schema.org/PreOrder",
          shippingDetails: {
            "@type": "OfferShippingDetails",
            shippingRate: {
              "@type": "MonetaryAmount",
              value: logistics[0]?.price ?? 0,
              currency: "RUB",
            },
            shippingDestination: { "@type": "DefinedRegion", addressCountry: "RU" },
          },
          hasMerchantReturnPolicy: {
            "@type": "MerchantReturnPolicy",
            applicableCountry: "RU",
            returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
            merchantReturnDays: 14,
          },
        },
        aggregateRating: { "@type": "AggregateRating", ratingValue: 4.8, reviewCount: 126 },
      }
    : null;

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-5xl overflow-y-auto">
        {product && (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl font-extrabold text-foreground">
                {product.name}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {product.sku}
                </span>
              </DialogTitle>
            </DialogHeader>

            <div className="grid gap-8 lg:grid-cols-2">
              <div>
                <ClientOnly fallback={<CadViewerPlaceholder />}>
                  {CadViewer ? (
                    <CadViewer
                      glbUrl={product.engineering_assets.model_glb_url}
                      category={product.category}
                    />
                  ) : (
                    <CadViewerPlaceholder />
                  )}
                </ClientOnly>
                <p className="mt-3 text-xs text-muted-foreground">
                  Модель сжата Draco · вращение мышью, зум колесом. Геометрия совпадает с
                  отливкой артикула {product.sku}.
                </p>
              </div>

              <div>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-b border-border pb-6 text-sm">
                  {[
                    ["Материал", product.material],
                    ["Габариты", product.dims],
                    ["Нагрузка", product.load],
                    ["Стандарт", product.gost],
                    ["Вес детали", `${(product.weight * 1000).toFixed(0)} г`],
                    [
                      "Наличие",
                      product.stock.qty > 0
                        ? `${product.stock.qty.toLocaleString("ru-RU")} шт`
                        : product.stock.lead!,
                    ],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{k}</dt>
                      <dd className="mt-0.5 font-medium text-foreground">{v}</dd>
                    </div>
                  ))}
                </dl>

                {assetGroup?.description && (
                  <p className="mt-5 text-sm leading-[1.65] text-foreground">
                    {assetGroup.description}
                  </p>
                )}

                <div className="mt-6 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    CAD-ассеты для проектировщика · без регистрации
                  </p>
                  {(
                    [
                      ["step", "Скачать модель STEP", "Твердотельная 3D", Layers, product.engineering_assets.model_step_url],
                      ["dwg", "Скачать чертёж DWG", "AutoCAD 2D", Ruler, product.engineering_assets.model_dwg_url],
                      ["pdf", "Технический паспорт PDF", "Схема, ГОСТы, допуски", FileText, product.engineering_assets.passport_pdf_url],
                    ] as const
                  ).map(([fmt, label, hint, Icon, href]) => (
                    <a
                      key={fmt}
                      href={href}
                      download
                      onClick={() => trackCadDownload(product.sku, fmt)}
                      className="flex items-center gap-3 rounded-sm border border-border px-4 py-3 text-sm font-medium text-foreground transition-colors hover:border-primary hover:text-primary"
                    >
                      <Icon className="size-4 shrink-0" strokeWidth={1.75} />
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                      <span className="hidden shrink-0 text-xs font-normal text-muted-foreground sm:inline">
                        {hint}
                      </span>
                      <Download className="size-4 shrink-0" strokeWidth={1.75} />
                    </a>
                  ))}
                </div>

                <div className="mt-6 rounded-lg border border-border p-4">
                  <div className="flex flex-col gap-2">
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <Truck className="size-4" strokeWidth={1.5} /> Логистика на партию
                    </p>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                      <CityInput value={city} onChange={setCity} />
                      <input
                        value={batch}
                        onChange={(e) =>
                          setBatch(Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1))
                        }
                        inputMode="numeric"
                        pattern="[0-9]*"
                        aria-label="Количество, шт"
                        className="mt-3 h-11 w-[104px] shrink-0 rounded-sm border border-[#D1D5DB] px-3 text-base outline-none focus:border-foreground"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Расчётный груз: {parcel.totalWeight.toLocaleString("ru-RU")} кг ·{" "}
                      {parcel.totalVolume.toLocaleString("ru-RU")} м³
                    </p>
                  </div>

                  {calcState === "loading" && (
                    <ul className="mt-3 space-y-2" aria-busy="true">
                      {[0, 1].map((i) => (
                        <li key={i} className="flex justify-between gap-4">
                          <span className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                          <span className="h-4 w-16 animate-pulse rounded bg-muted" />
                        </li>
                      ))}
                    </ul>
                  )}

                  {calcState === "failed" && (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Расчет недоступен. Стоимость уточнит менеджер.
                    </p>
                  )}

                  {calcState === "ready" && (
                    <ul className="mt-3 space-y-2 text-sm">
                      {logistics.map((l) => (
                        <li key={l.carrier} className="flex justify-between gap-4">
                          <span className="text-muted-foreground">
                            {l.label} · {l.days} дн.
                          </span>
                          <span className="font-medium tabular-nums text-foreground">
                            {l.price.toLocaleString("ru-RU")} ₽
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {calcState === "idle" && (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Укажите город — рассчитаем доставку по реальным тарифам ТК.
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setBulkOpen(true)}
                  className="mt-4 inline-flex min-h-[44px] cursor-pointer items-center rounded-sm px-1 text-left text-sm font-medium text-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
                >
                  Запросить спец. условия на партию от{" "}
                  {(product.tier2Qty || 50000).toLocaleString("ru-RU")} шт →
                </button>
              </div>
            </div>

            <BulkRequestDialog
              product={product}
              open={bulkOpen}
              onClose={() => setBulkOpen(false)}
            />

            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CadViewerPlaceholder() {
  return (
    <div className="grid h-72 place-items-center rounded-lg bg-surface font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
      Инициализация WebGL...
    </div>
  );
}
