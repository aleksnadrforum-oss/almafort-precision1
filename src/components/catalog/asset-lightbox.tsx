import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Product } from "@/data/catalog";
import { isOnRequest, tierOf } from "@/data/catalog";
import { formatPrice, lineTotal } from "@/lib/pricing";
import type { AssetGroup } from "@/lib/asset-groups";

/**
 * Lightbox карточки товара: карусель мастер-фотографий группы контента,
 * утверждённое инженерное описание, каскадная цена и добавление в корзину.
 */
export function AssetLightbox({
  product,
  group,
  onClose,
  onAdd,
}: {
  product: Product;
  group: AssetGroup;
  onClose: () => void;
  onAdd: (p: Product, qty: number) => void;
}) {
  const [slide, setSlide] = useState(0);
  const [qty, setQty] = useState(0);
  const [colorChoice, setColorChoice] = useState("Белый");

  const [state, setState] = useState<"idle" | "loading">("idle");
  const onRequest = isOnRequest(product);
  const tier = tierOf(qty, product);
  const images = group.images;

  useEffect(() => setSlide(0), [product.sku]);

  const add = async () => {
    if (qty <= 0) {
      toast.error("Укажите количество");
      return;
    }
    setState("loading");
    try {
      const res = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku: product.sku, quantity: qty }),
      });
      if (!res.ok) throw new Error("cart");
      const data = (await res.json()) as { quantity: number };
      onAdd(product, data.quantity);
      toast.success(`${product.sku} · ${qty.toLocaleString("ru-RU")} шт в корзине`);
      onClose();
    } catch {
      toast.error("Не удалось добавить позицию — повторите");
    } finally {
      setState("idle");
    }
  };

  const step = (d: number) =>
    setSlide((s) => (images.length ? (s + d + images.length) % images.length : 0));

  const prices: Array<[string, number, 0 | 1 | 2]> = [
    ["от 1 шт", product.price, 0],
    [`от ${product.tier1Qty.toLocaleString("ru-RU")} шт`, product.price1000, 1],
    [`от ${product.tier2Qty.toLocaleString("ru-RU")} шт`, product.price5000, 2],
  ];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="top-auto bottom-0 left-0 h-[92dvh] max-h-[92dvh] w-full max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-t-2xl p-5 sm:top-[50%] sm:bottom-auto sm:left-[50%] sm:h-auto sm:max-h-[90dvh] sm:max-w-4xl sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-extrabold text-foreground">
            {product.name}
            <span className="ml-2 text-sm font-normal text-muted-foreground">{product.sku}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-2 md:gap-8">
          {/* Слайдер мастер-фотографий: свайп на телефоне, стрелки на десктопе */}
          <div>
            <div className="relative overflow-hidden rounded-lg border border-border bg-white">
              <div
                className="swipe-track no-scrollbar aspect-square"
                onScroll={(e) => {
                  const el = e.currentTarget;
                  const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
                  if (i !== slide) setSlide(i);
                }}
                ref={(el) => {
                  if (el && el.clientWidth) {
                    const target = slide * el.clientWidth;
                    if (Math.abs(el.scrollLeft - target) > 4) el.scrollLeft = target;
                  }
                }}
              >
                {images.map((img) => (
                  <div key={img.full_url} className="swipe-slide grid place-items-center">
                    <img
                      src={img.full_url}
                      alt={img.caption ?? product.name}
                      loading="lazy"
                      className="h-full w-full object-contain p-4"
                    />
                  </div>
                ))}
              </div>
              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="Предыдущее фото"
                    onClick={() => step(-1)}
                    className="absolute left-2 top-1/2 hidden -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-background/85 text-foreground shadow-sm transition-all hover:scale-105 hover:bg-background md:grid md:size-9"
                  >
                    <ChevronLeft className="size-5" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    aria-label="Следующее фото"
                    onClick={() => step(1)}
                    className="absolute right-2 top-1/2 hidden -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-background/85 text-foreground shadow-sm transition-all hover:scale-105 hover:bg-background md:grid md:size-9"
                  >
                    <ChevronRight className="size-5" strokeWidth={1.75} />
                  </button>
                </>
              )}
            </div>

            {images.length > 1 && (
              <>
                {/* Точки-индикаторы для мобильного свайпа */}
                <div className="mt-3 flex justify-center gap-2 md:hidden">
                  {images.map((img, i) => (
                    <button
                      key={`dot-${img.thumb_url}`}
                      type="button"
                      aria-label={`Фото ${i + 1}`}
                      onClick={() => setSlide(i)}
                      className="tap-sm grid size-6 place-items-center"
                    >
                      <span
                        className={`block size-2 rounded-full transition-colors ${
                          i === slide ? "bg-primary" : "bg-border"
                        }`}
                      />
                    </button>
                  ))}
                </div>

                <div className="mt-3 hidden gap-2 md:flex">
                  {images.map((img, i) => (
                    <button
                      key={img.thumb_url}
                      type="button"
                      onClick={() => setSlide(i)}
                      aria-label={`Фото ${i + 1}`}
                      className={`grid size-14 place-items-center overflow-hidden rounded-md border bg-white transition-colors ${
                        i === slide ? "border-primary" : "border-border hover:border-foreground/40"
                      }`}
                    >
                      <img
                        src={img.thumb_url}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-contain p-1"
                      />
                    </button>
                  ))}
                </div>
              </>
            )}

            {images[slide]?.caption && (
              <p className="mt-2 text-xs leading-[1.5] text-muted-foreground">
                {images[slide].caption}
              </p>
            )}
          </div>


          {/* Спецификация, цена, описание */}
          <div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-b border-border pb-5 text-sm">
              {[
                ["Габариты", product.dims],
                ["Материал", product.material],
                ["Цвет", product.color ?? "—"],
                [
                  "Наличие",
                  product.stock.qty > 0
                    ? `${product.stock.qty.toLocaleString("ru-RU")} шт`
                    : (product.stock.lead ?? "под заказ"),
                ],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs uppercase tracking-wider text-muted-foreground">{k}</dt>
                  <dd className="mt-0.5 font-medium text-foreground">{v}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-5 space-y-1.5">
              {onRequest ? (
                <p className="text-sm text-muted-foreground">Цена по запросу</p>
              ) : (
                prices.map(([label, value, level]) => (
                  <div
                    key={label}
                    className={`flex items-center justify-between rounded-sm px-2 py-1 text-sm tabular-nums ${
                      qty > 0 && tier === level
                        ? "bg-[#E8F5E9] font-semibold text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    <span>{label}</span>
                    <span>{formatPrice(value)}</span>
                  </div>
                ))
              )}
            </div>

            {group.description && (
              <>
                {/* На смартфоне описание прячем под аккордеон, на десктопе — открыто */}
                <details className="mt-5 border-t border-border pt-4 md:hidden">
                  <summary className="flex cursor-pointer list-none items-center text-sm font-semibold text-foreground">
                    Развернуть характеристики
                  </summary>
                  <p className="mt-3 text-sm leading-[1.65] text-foreground">
                    {group.description}
                  </p>
                </details>
                <p className="mt-5 hidden border-t border-border pt-5 text-sm leading-[1.65] text-foreground md:block">
                  {group.description}
                </p>
              </>
            )}

            {product.sku.startsWith("ZGD-") && (
              <div className="mt-5">
                <label
                  htmlFor={`color-${product.sku}`}
                  className="text-xs uppercase tracking-wider text-muted-foreground"
                >
                  Цвет по ЛДСП
                </label>
                <select
                  id={`color-${product.sku}`}
                  value={colorChoice}
                  onChange={(e) => setColorChoice(e.target.value)}
                  className="mt-1.5 h-12 w-full cursor-pointer rounded-sm border border-[#D1D5DB] bg-card px-3 text-sm outline-none transition-colors hover:border-foreground/50 focus:border-foreground"
                >
                  {["Белый", "Чёрный", "Венге", "Дуб Сонома", "Бук", "Серый"].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Цвет уточняется менеджером при подтверждении заказа.
                </p>
              </div>
            )}


            {!onRequest && (
              <div className="safe-bottom sticky bottom-0 mt-6 flex gap-3 bg-card pt-3 md:static md:pt-0">
                <div className="no-select flex shrink-0 items-stretch">
                  <button
                    type="button"
                    aria-label="Уменьшить количество"
                    onClick={() => setQty((v) => Math.max(0, v - 100))}
                    className="grid h-12 w-11 place-items-center rounded-l-sm border border-r-0 border-[#D1D5DB] text-foreground active:scale-95 md:hidden"
                  >
                    −
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={qty || ""}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/[^0-9]/g, "").slice(0, 7);
                      setQty(digits ? Number.parseInt(digits, 10) : 0);
                    }}
                    placeholder="0"
                    aria-label={`Количество ${product.sku}`}
                    className="h-12 w-20 border border-[#D1D5DB] bg-card px-2 text-center tabular-nums outline-none transition-colors focus:border-foreground md:w-28 md:rounded-sm md:px-3 md:text-right"
                  />
                  <button
                    type="button"
                    aria-label="Увеличить количество"
                    onClick={() => setQty((v) => Math.min(9_999_999, v + 100))}
                    className="grid h-12 w-11 place-items-center rounded-r-sm border border-l-0 border-[#D1D5DB] text-foreground active:scale-95 md:hidden"
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => void add()}
                  disabled={state === "loading"}
                  className="flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-sm bg-[#DC2626] px-4 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#B91C1C] hover:shadow-md active:scale-[0.98] disabled:opacity-50"
                >
                  {state === "loading" ? (
                    <Loader2 className="size-4 animate-spin" strokeWidth={1.75} />
                  ) : (
                    <ShoppingCart className="size-4" strokeWidth={1.75} />
                  )}
                  {qty > 0 ? formatPrice(lineTotal(product, qty)) : "В корзину"}
                </button>
              </div>
            )}

          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
