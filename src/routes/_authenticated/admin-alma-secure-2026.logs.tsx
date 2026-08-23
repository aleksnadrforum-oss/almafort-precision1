import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { adminListLogs } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin-alma-secure-2026/logs")({
  component: AuditLog,
});

const ACTION_LABEL: Record<string, string> = {
  UPDATE_ORDER_ITEMS: "Изменение позиций заказа",
  UPDATE_ORDER_STATUS: "Смена статуса заказа",
  ATTACH_DOCUMENT: "Прикрепление документа",
  UPDATE_COMPANY_LOYALTY: "Грейд / отсрочка контрагента",
  UPDATE_PRODUCTS: "Изменение цен и остатков",
  BATCH_IMPORT_CSV: "Импорт каталога CSV",
  UPDATE_PROMPT: "Новая версия промпта",
  ROLLBACK_PROMPT: "Откат промпта",
  UPDATE_SETTING: "Системные настройки",
  UPDATE_API_KEY: "Обновление API-ключа",
  GRANT_ROLE: "Выдача роли",
  REVOKE_ROLE: "Отзыв роли",
};

/** Человекочитаемая разница «было → стало» без сырого JSON в интерфейсе. */
function details(row: { target: string | null; old_value: unknown; new_value: unknown }) {
  const parts: string[] = [];
  if (row.target) parts.push(row.target);
  const short = (v: unknown) => {
    if (v === null || v === undefined) return null;
    if (typeof v === "object") return JSON.stringify(v).slice(0, 160);
    return String(v).slice(0, 160);
  };
  const before = short(row.old_value);
  const after = short(row.new_value);
  if (before && after) parts.push(`${before} → ${after}`);
  else if (after) parts.push(after);
  return parts.join(" · ") || "—";
}

function AuditLog() {
  const list = useServerFn(adminListLogs);
  const [page, setPage] = useState(0);
  const { data, isFetching } = useQuery({
    queryKey: ["admin-logs", page],
    queryFn: () => list({ data: { page } }),
  });
  const pages = data ? Math.ceil(data.count / 50) : 0;

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Журнал действий персонала</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Каждое сохранение в разделах «Заказы», «Каталог», «Контрагенты», «ИИ» и «Настройки»
          фиксируется здесь. Раздел виден только роли «Владелец».
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-background">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Дата / время</th>
              <th className="px-4 py-3">Администратор</th>
              <th className="px-4 py-3">Действие</th>
              <th className="px-4 py-3">Детали</th>
            </tr>
          </thead>
          <tbody>
            {(data?.rows ?? []).map((r) => (
              <tr key={r.id} className="border-t align-top">
                <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString("ru-RU")}
                </td>
                <td className="px-4 py-3">{r.admin_email ?? "—"}</td>
                <td className="px-4 py-3 font-medium">{ACTION_LABEL[r.action] ?? r.action}</td>
                <td className="max-w-[520px] break-words px-4 py-3 text-muted-foreground">
                  {details(r)}
                </td>
              </tr>
            ))}
            {!isFetching && !data?.rows.length && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                  Записей пока нет
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <button
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          className="rounded-md border px-3 py-1.5 transition-colors hover:bg-muted disabled:opacity-40"
        >
          Назад
        </button>
        <span className="text-muted-foreground">
          Стр. {page + 1} из {Math.max(1, pages)} · всего {data?.count ?? 0}
        </span>
        <button
          disabled={page + 1 >= pages}
          onClick={() => setPage((p) => p + 1)}
          className="rounded-md border px-3 py-1.5 transition-colors hover:bg-muted disabled:opacity-40"
        >
          Вперёд
        </button>
      </div>
    </section>
  );
}
