import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { adminListCompanies, adminUpdateCompany } from "@/lib/admin.functions";
import { formatPrice } from "@/lib/pricing";
import { TIER_META } from "@/lib/loyalty";

export const Route = createFileRoute("/_authenticated/admin-alma-secure-2026/companies")({
  component: Companies,
});

/** Тумблер вместо чекбокса: явное состояние «вкл/выкл» с плавным переходом. */
function Toggle({
  on,
  label,
  onChange,
}: {
  on: boolean;
  label: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${
        on ? "bg-[#DC2626]" : "bg-muted-foreground/30"
      } hover:opacity-90 active:scale-95`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${
          on ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

function Companies() {
  const qc = useQueryClient();
  const list = useServerFn(adminListCompanies);
  const update = useServerFn(adminUpdateCompany);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["admin-companies", q],
    queryFn: () => list({ data: q ? { q } : {} }),
  });

  const mutation = useMutation({
    mutationFn: (v: {
      id: string;
      manual_tier_override: boolean;
      assigned_tier: number;
      credit_allowed: boolean;
    }) => update({ data: v }),
    onSuccess: () => {
      setMsg("Сохранено");
      qc.invalidateQueries({ queryKey: ["admin-companies"] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-bold">Контрагенты</h1>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ИНН или название"
          className="rounded-md border bg-background px-3 py-2 text-sm"
        />
      </div>
      {msg && <div className="rounded-lg border bg-background px-4 py-3 text-sm">{msg}</div>}

      <div className="overflow-x-auto rounded-xl border bg-background">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Компания</th>
              <th className="px-4 py-3">ИНН / КПП</th>
              <th className="px-4 py-3 text-right">Объём (LTV)</th>
              <th className="px-4 py-3">Грейд</th>
              <th className="px-4 py-3">Ручной режим</th>
              <th className="px-4 py-3">Отсрочка</th>
              <th className="px-4 py-3">Активность</th>
            </tr>
          </thead>
          <tbody>
            {(data?.rows ?? []).map((c) => (
              <tr key={c.id} className="border-t align-top">
                <td className="px-4 py-3">
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.legal_address ?? "—"}</div>
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {c.inn}
                  {c.kpp ? ` / ${c.kpp}` : ""}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatPrice(Number(c.lifetime_value ?? 0))}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={c.assigned_tier ?? 1}
                    disabled={!c.manual_tier_override}
                    title={
                      c.manual_tier_override
                        ? "Грейд задаётся вручную"
                        : "Включите «Ручной режим», чтобы задать грейд вручную"
                    }
                    onChange={(e) =>
                      mutation.mutate({
                        id: c.id,
                        manual_tier_override: true,
                        assigned_tier: Number(e.target.value),
                        credit_allowed: c.credit_allowed ?? false,
                      })
                    }
                    className="rounded-md border bg-background px-2 py-1 transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {[1, 2, 3].map((t) => (
                      <option key={t} value={t}>
                        {t} · {TIER_META[t as 1 | 2 | 3].name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <Toggle
                    on={c.manual_tier_override ?? false}
                    label="Ручной режим грейда"
                    onChange={(v) =>
                      mutation.mutate({
                        id: c.id,
                        manual_tier_override: v,
                        assigned_tier: c.assigned_tier ?? 1,
                        credit_allowed: c.credit_allowed ?? false,
                      })
                    }
                  />
                </td>
                <td className="px-4 py-3">
                  <Toggle
                    on={c.credit_allowed ?? false}
                    label="Отсрочка платежа"
                    onChange={(v) => {
                      if (v && (c.assigned_tier ?? 1) < 3) {
                        setMsg(
                          `Отсрочка доступна только грейду 3 — у «${c.name}» сейчас грейд ${c.assigned_tier ?? 1}.`,
                        );
                        return;
                      }
                      mutation.mutate({
                        id: c.id,
                        manual_tier_override: c.manual_tier_override ?? false,
                        assigned_tier: c.assigned_tier ?? 1,
                        credit_allowed: v,
                      });
                    }}
                  />
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {c.last_activity_at
                    ? new Date(c.last_activity_at).toLocaleDateString("ru-RU")
                    : "—"}
                </td>
              </tr>
            ))}
            {!data?.rows.length && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  Контрагентов не найдено
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Ручной режим отключает автоматический ночной пересчёт грейда для компании.
      </p>
    </section>
  );
}
