import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { adminGetAi, adminRollbackPrompt, adminSavePrompt } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin-alma-secure-2026/ai")({
  component: AiPanel,
});

function AiPanel() {
  const qc = useQueryClient();
  const get = useServerFn(adminGetAi);
  const save = useServerFn(adminSavePrompt);
  const rollback = useServerFn(adminRollbackPrompt);
  const [slot, setSlot] = useState<"configurator" | "vision">("configurator");
  const [content, setContent] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const { data } = useQuery({ queryKey: ["admin-ai"], queryFn: () => get() });

  const versions = (data?.prompts ?? []).filter((p) => p.slot === slot);
  const active = versions.find((p) => p.is_active);

  useEffect(() => {
    setContent(active?.content ?? "");
  }, [active?.id, slot]);

  const saveMutation = useMutation({
    mutationFn: () => save({ data: { slot, content } }),
    onSuccess: (r) => {
      setMsg(`Сохранена версия v${r.version}. Предыдущая осталась в архиве.`);
      qc.invalidateQueries({ queryKey: ["admin-ai"] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const rollbackMutation = useMutation({
    mutationFn: (id: string) => rollback({ data: { id } }),
    onSuccess: () => {
      setMsg("Откат выполнен");
      qc.invalidateQueries({ queryKey: ["admin-ai"] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const usage = data?.usage;

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-bold">Управление ИИ</h1>
      {msg && <div className="rounded-lg border bg-background px-4 py-3 text-sm">{msg}</div>}

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Вызовов за сутки", value: usage?.day.calls ?? 0 },
          {
            label: "Токенов за месяц",
            value: (usage?.month.tokens ?? 0).toLocaleString("ru-RU"),
          },
          {
            label: "Расходы за месяц",
            value: `$${(usage?.month.cost ?? 0).toFixed(2)}`,
          },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border bg-background p-5">
            <div className="text-xs uppercase text-muted-foreground">{c.label}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-background p-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="mr-auto font-semibold">Системный промпт</h2>
          <select
            value={slot}
            onChange={(e) => setSlot(e.target.value as typeof slot)}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="configurator">ИИ-конфигуратор</option>
            <option value="vision">Фото-сканер (Vision)</option>
          </select>
          <button
            disabled={content.trim().length < 20 || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
            className="rounded-md bg-[#DC2626] px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-[#B91C1C] hover:shadow-md active:scale-[0.98] disabled:opacity-40"
          >
            Сохранить новую версию
          </button>
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={14}
          placeholder="Правила поведения нейросети…"
          className="w-full rounded-lg border bg-background p-4 font-mono text-xs leading-relaxed focus:border-[#DC2626] focus:outline-none"
        />
        <div className="mt-4 space-y-2 text-sm">
          {versions.map((v) => (
            <div key={v.id} className="flex items-center gap-3 border-b pb-2">
              <span className="font-medium">v{v.version}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(v.created_at).toLocaleString("ru-RU")}
              </span>
              {v.is_active && (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                  активна
                </span>
              )}
              {!v.is_active && (
                <button
                  onClick={() => rollbackMutation.mutate(v.id)}
                  className="ml-auto rounded-md border px-3 py-1 text-xs transition-colors hover:bg-muted"
                >
                  Откатиться к этой версии
                </button>
              )}
            </div>
          ))}
          {!versions.length && (
            <p className="text-muted-foreground">
              Версий пока нет — сохранённая версия переопределит промпт по умолчанию.
            </p>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-background">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Дата</th>
              <th className="px-4 py-3">Запрос клиента</th>
              <th className="px-4 py-3">Ответ ИИ</th>
              <th className="px-4 py-3">Парсинг</th>
              <th className="px-4 py-3 text-right">Токены</th>
            </tr>
          </thead>
          <tbody>
            {(data?.logs ?? []).map((l) => (
              <tr key={l.id} className="border-t align-top">
                <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                  {new Date(l.created_at).toLocaleString("ru-RU")}
                </td>
                <td className="max-w-[320px] px-4 py-3">{l.prompt}</td>
                <td className="max-w-[420px] px-4 py-3 text-muted-foreground">
                  {(l.response ?? "").slice(0, 240)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs ${
                      l.parse_status === "ok"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-red-200 bg-red-50 text-red-700"
                    }`}
                  >
                    {l.parse_status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {(l.prompt_tokens ?? 0) + (l.completion_tokens ?? 0)}
                </td>
              </tr>
            ))}
            {!data?.logs.length && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  Диалогов пока нет
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
