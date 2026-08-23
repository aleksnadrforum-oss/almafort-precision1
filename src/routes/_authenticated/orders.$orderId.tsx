import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { BackLink } from "@/components/back-link";
import { formatPrice } from "@/lib/pricing";
import { STAGES, stageIndex } from "@/lib/loyalty";
import { getOrderDetail, repeatOrder } from "@/lib/cabinet.functions";
import { useCart } from "@/store/cart-store";

const DOC_LABEL: Record<string, string> = {
  invoice: "Счёт на оплату",
  contract: "Договор поставки",
  upd: "УПД",
  quality: "Паспорт качества",
};

export const Route = createFileRoute("/_authenticated/orders/$orderId")({
  head: () => ({
    meta: [
      { title: "Заказ ALMAFORT — сквозной трекинг и документы" },
      {
        name: "description",
        content:
          "Единый таймлайн заказа: счёт, оплата, производство, ОТК, отгрузка и статусы транспортной компании в одном окне.",
      },
      { property: "og:title", content: "Карточка заказа ALMAFORT" },
      { property: "og:description", content: "Трекинг от станка до двери и архив документов." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: OrderPage,
});

type Item = { sku: string; name: string; quantity: number; unit: number; sum: number };

function OrderPage() {
  const { orderId } = Route.useParams();
  const fetchOrder = useServerFn(getOrderDetail);
  const repeat = useServerFn(repeatOrder);
  const addLine = useCart((s) => s.addLine);
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => fetchOrder({ data: { orderId } }),
  });

  const onRepeat = async () => {
    try {
      const { items, unavailable, repriced } = await repeat({ data: { orderId } });
      items.forEach((i) => addLine(i.sku, i.quantity));
      if (unavailable.length) {
        toast.warning(
          `Внимание: ${unavailable.length} поз. из прошлого заказа больше не поставляются (${unavailable.join(", ")}).`,
        );
      }
      if (repriced.length) {
        toast.info(`Цены обновлены по текущему прайсу: ${repriced.length} поз.`);
      }
      toast.success("Спецификация перенесена в корзину по актуальным ценам");
      void navigate({ to: "/cart" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось повторить заказ");
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[900px] flex-1 px-5 pb-24 pt-10 lg:px-10">
        <BackLink fallback="/cabinet" label="В кабинет" className="mb-6" />

        {isLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Загружаем заказ…
          </p>
        )}
        {error && <p className="text-sm text-primary">Заказ недоступен.</p>}

        {data && (
          <>
            <header className="mb-8">
              <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
                Заказ № {data.order.number}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                от {new Date(data.order.created_at).toLocaleDateString("ru-RU")}
                {data.order.city ? ` · доставка в ${data.order.city}` : ""}
                {data.order.deferred_payment ? " · отгрузка с отсрочкой платежа" : ""}
              </p>
              <p className="mt-3 text-2xl font-extrabold tabular-nums text-foreground">
                {formatPrice(Number(data.order.total))}
              </p>
              <button
                type="button"
                onClick={onRepeat}
                className="mt-4 inline-flex min-h-[48px] w-full cursor-pointer items-center justify-center gap-2 rounded-sm bg-primary px-4 py-2.5 sm:w-auto text-sm font-semibold text-primary-foreground transition-all duration-200 hover:-translate-y-px hover:bg-[#B91C1C] hover:shadow-[0_8px_20px_oklch(0_0_0/0.18)] active:scale-[0.98]"
              >
                <RefreshCw className="size-4" strokeWidth={1.75} /> Повторить заказ
              </button>
            </header>

            {/* Единый таймлайн: внутренние этапы ALMAFORT + статусы ТК */}
            <section className="rounded-sm border border-border bg-card p-5 sm:p-6 lg:p-8">
              <h2 className="text-lg font-bold text-foreground">Ход сделки</h2>
              <ol className="mt-5 space-y-0">
                {STAGES.map((s, i) => {
                  const current = Math.max(0, stageIndex(data.order.status));
                  const done = i < current;
                  const active = i === current;
                  const event = [...data.events].reverse().find((e) => e.stage === s.id);
                  return (
                    <li key={s.id} className="relative flex gap-4 pb-6 last:pb-0">
                      <div className="flex flex-col items-center">
                        <span
                          className={`grid size-8 shrink-0 place-items-center rounded-full text-sm transition-colors ${
                            active
                              ? "bg-primary text-primary-foreground"
                              : done
                                ? "bg-[#E8F5E9] text-foreground"
                                : "bg-[#F1F3F5] text-muted-foreground"
                          }`}
                        >
                          {s.icon}
                        </span>
                        {i < STAGES.length - 1 && (
                          <span
                            className={`mt-1 w-px flex-1 ${done ? "bg-primary/40" : "bg-border"}`}
                          />
                        )}
                      </div>
                      <div className="pb-1">
                        <p
                          className={`text-sm ${active || done ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                        >
                          {s.title}
                        </p>
                        {event && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {event.note ?? event.title} ·{" "}
                            {new Date(event.created_at).toLocaleString("ru-RU")}
                            {event.source !== "almafort" ? ` · ${event.source.toUpperCase()}` : ""}
                          </p>
                        )}
                        {s.id === "shipped" && data.order.tracking_number && (
                          <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                            Трек-номер: {data.order.tracking_number}
                          </p>
                        )}
                        {s.id === "arrived" && data.order.pvz_address && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {data.order.pvz_address}
                            {data.order.storage_until
                              ? ` · бесплатное хранение до ${new Date(data.order.storage_until).toLocaleDateString("ru-RU")}`
                              : ""}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>

            {/* Документы */}
            <section className="mt-6 rounded-sm border border-border bg-card p-5 sm:p-6 lg:p-8">
              <h2 className="text-lg font-bold text-foreground">Документы</h2>
              {data.documents.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Документы появятся здесь по мере прохождения сделки: счёт, договор поставки, УПД и
                  паспорта качества на партию.
                </p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {data.documents.map((d) => (
                    <li key={d.id}>
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-h-[52px] items-center gap-3 rounded-md border border-border px-4 text-[15px] font-semibold text-foreground transition-colors hover:border-primary hover:text-primary"
                      >
                        <Download className="size-4" strokeWidth={1.75} />
                        {d.title || DOC_LABEL[d.kind] || "Документ"}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Состав */}
            <section className="mt-6 rounded-sm border border-border bg-card p-5 sm:p-6 lg:p-8">
              <h2 className="text-lg font-bold text-foreground">Спецификация</h2>
              <ul className="mt-4 divide-y divide-border">
                {((data.order.items ?? []) as Item[]).map((it) => (
                  <li key={it.sku} className="flex items-baseline justify-between gap-3 py-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{it.name}</p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {it.sku} · {it.quantity} шт × {formatPrice(it.unit)}
                      </p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {formatPrice(it.sum)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
