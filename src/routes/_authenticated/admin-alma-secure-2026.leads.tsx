import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminBulkRequests, adminSetBulkStatus } from "@/lib/admin.functions";
import { formatPrice } from "@/lib/pricing";

export const Route = createFileRoute("/_authenticated/admin-alma-secure-2026/leads")({
  component: BulkLeads,
});

const STATUS_LABEL: Record<string, string> = {
  new: "Новая",
  in_work: "В работе",
  done: "Обработана",
};

function BulkLeads() {
  const list = useServerFn(adminBulkRequests);
  const setStatus = useServerFn(adminSetBulkStatus);
  const qc = useQueryClient();

  const { data } = useQuery({ queryKey: ["admin-bulk"], queryFn: () => list() });
  const mutate = useMutation({
    mutationFn: (v: { id: string; status: "new" | "in_work" | "done" }) => setStatus({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-bulk"] }),
  });

  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-bold">Оптовые заявки из карточек</h1>

      <div className="space-y-3">
        {(data?.rows ?? []).map((r) => (
          <article key={r.id} className="rounded-lg border bg-background p-4 text-sm">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-foreground">
                  Запрос спеццены на товар: {r.product_name}
                </p>
                <p className="text-xs text-muted-foreground">
                  Артикул {r.sku} · базовая цена {formatPrice(Number(r.base_price))} · Желаемый
                  объем: {Number(r.qty).toLocaleString("ru-RU")} шт
                </p>
              </div>
              <select
                value={r.status}
                onChange={(e) =>
                  mutate.mutate({
                    id: r.id,
                    status: e.target.value as "new" | "in_work" | "done",
                  })
                }
                className="h-9 shrink-0 rounded-md border bg-background px-2 text-xs"
              >
                {Object.entries(STATUS_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-2 text-foreground">
              {r.contact_name} · {r.phone}
              {r.email ? ` · ${r.email}` : ""}
              {r.inn ? ` · ИНН ${r.inn}` : ""}
            </p>
            {r.comment && <p className="mt-1 text-muted-foreground">{r.comment}</p>}
            <p className="mt-1 text-xs text-muted-foreground">
              {new Date(r.created_at).toLocaleString("ru-RU")}
            </p>
          </article>
        ))}
        {!data?.rows.length && (
          <p className="text-sm text-muted-foreground">Заявок на спеццену пока нет.</p>
        )}
      </div>
    </section>
  );
}
