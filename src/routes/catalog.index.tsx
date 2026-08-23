import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { ParsingSkeleton, SpecUpload } from "@/components/cart/spec-upload";
import { useCart, cartTotals } from "@/store/cart-store";
import { SearchPanel } from "@/components/catalog/search-panel";
import { CatalogMatrix } from "@/components/catalog/catalog-matrix";
import { formatPrice } from "@/lib/pricing";
import { ProductSheet } from "@/components/catalog/product-sheet";
import { AiConfigurator } from "@/components/catalog/ai-configurator";
import { ModuleErrorBoundary } from "@/components/error-boundary";
import { type Product } from "@/data/catalog";
import { CATEGORY_FACETS } from "@/lib/seo";
import { BackLink } from "@/components/back-link";

export const Route = createFileRoute("/catalog/")({
  head: () => ({
    meta: [
      { title: "Каталог ALMAFORT — прайс-матрица пластиковых комплектующих" },
      {
        name: "description",
        content:
          "B2B-терминал ALMAFORT: поиск по артикулу и фото, матрица оптовых цен, наличие на складе, чертежи DWG и STEP, расчёт доставки.",
      },
      { property: "og:title", content: "Каталог ALMAFORT — прайс-матрица для снабженцев" },
      {
        property: "og:description",
        content:
          "Умный поиск, оптовые тиры цен, остатки склада и инженерная документация в одном интерфейсе.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: "https://almafort.ru/catalog" },
    ],
    links: [{ rel: "canonical", href: "https://almafort.ru/catalog" }],
  }),
  component: CatalogPage,
});

function CatalogPage() {
  const [query, setQuery] = useState("");
  const [scanning, setScanning] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [upload, setUpload] = useState(false);
  const lines = useCart((s) => s.lines);
  const parsing = useCart((s) => s.parsing);
  const addLine = useCart((s) => s.addLine);
  const cart = { lines: lines.length, total: cartTotals(lines).goods };

  const add = (p: Product, qty: number) => {
    addLine(p.sku, qty);
    toast.success(`${p.sku} · ${qty.toLocaleString("ru-RU")} шт добавлено`);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />

      <main className="w-full flex-1 mx-auto max-w-[1440px] px-5 pb-24 pt-10 lg:px-10">
        <div className="mb-6">
          <BackLink fallback="/" label="Назад" />
        </div>

        <header className="mb-8 text-center">
          <h1 className="text-3xl font-extrabold leading-[1.08] tracking-tight text-foreground lg:text-[44px]">
            Каталог серийной продукции
          </h1>
          <p className="mx-auto mt-3 max-w-[60ch] text-sm leading-[1.5] text-muted-foreground lg:text-base">
            Прайс-матрица с остатками склада, тремя уровнями оптовых цен и инженерной
            документацией. Цена пересчитывается прямо в строке при вводе количества.
          </p>
        </header>

        <nav aria-label="Разделы каталога" className="mb-8 flex flex-wrap justify-center gap-2">
          {CATEGORY_FACETS.map((c) => (
            <a
              key={c.slug}
              href={`/catalog/${c.slug}`}
              className="rounded-sm border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors duration-200 hover:border-primary hover:text-primary"
            >
              {c.label}
            </a>
          ))}
        </nav>

        <SearchPanel
          query={query}
          onQuery={setQuery}
          onPick={setProduct}
          onScanChange={setScanning}
        />

        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => setUpload((v) => !v)}
            className="flex min-h-[48px] w-full cursor-pointer items-center justify-center gap-2 rounded-sm border border-[#D1D5DB] bg-[#F3F4F6] px-4 py-2.5 sm:w-auto text-sm font-semibold text-foreground transition-colors duration-200 hover:border-primary hover:text-primary"
          >
            <FileSpreadsheet className="size-4" strokeWidth={1.75} />
            Загрузить спецификацию Excel
          </button>
        </div>

        {upload && (
          <div className="mx-auto mt-4 w-full lg:w-[70%]">
            {parsing ? <ParsingSkeleton /> : <SpecUpload />}
          </div>
        )}

        <section
          className={`mt-10 transition-all duration-300 ${scanning ? "blur-sm" : ""}`}
          aria-label="Матрица каталога"
        >
          <CatalogMatrix query={query} onOpenProduct={setProduct} onAdd={add} />
        </section>

        <ModuleErrorBoundary title="ИИ-конфигуратор узла" hint="Соберите спецификацию через каталог — остальные разделы работают.">
          <AiConfigurator />
        </ModuleErrorBoundary>
      </main>

      {cart.lines > 0 && (
        <div className="above-tabbar-float fixed inset-x-3 z-30 flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-[0_16px_40px_oklch(0_0_0/0.12)] sm:inset-x-auto sm:left-1/2 sm:bottom-6 sm:w-auto sm:-translate-x-1/2 sm:rounded-full sm:px-6">
          <span className="min-w-0">
            <span className="text-muted-foreground">Позиций: </span>
            <span className="font-semibold text-foreground">{cart.lines}</span>
            <span className="mx-2 text-border">|</span>
            <span className="font-bold tabular-nums text-primary">{formatPrice(cart.total)}</span>
          </span>
          <a
            href="/cart"
            className="flex h-11 shrink-0 cursor-pointer items-center rounded-full bg-primary px-5 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            Оформить счёт
          </a>
        </div>
      )}


      <ProductSheet product={product} onClose={() => setProduct(null)} />
    </div>
  );
}
