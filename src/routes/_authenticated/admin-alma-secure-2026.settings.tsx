import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  adminGetSettings,
  adminListStaff,
  adminSaveApiKey,
  adminDeleteApiKey,
  adminSaveSetting,
  adminSetStaffRole,
  adminErpJobs,
  adminRetryErp,
} from "@/lib/admin.functions";
import { ROLE_LABEL, type AdminRole } from "@/lib/admin";
import { VAULT_GROUPS } from "@/lib/admin-data";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin-alma-secure-2026/settings")({
  component: Settings,
});

type ErpJobRow = {
  id: string;
  order_number: string;
  status: string;
  attempts: number;
  last_error: string | null;
  next_attempt_at: string;
  created_at: string;
};

function Settings() {
  const qc = useQueryClient();
  const get = useServerFn(adminGetSettings);
  const saveSetting = useServerFn(adminSaveSetting);
  const saveKey = useServerFn(adminSaveApiKey);
  const deleteKey = useServerFn(adminDeleteApiKey);
  const staffList = useServerFn(adminListStaff);
  const setRole = useServerFn(adminSetStaffRole);
  const erpJobs = useServerFn(adminErpJobs);
  const retryErp = useServerFn(adminRetryErp);

  /** Человеческие названия статусов очереди обмена. */
  const ERP_STATUS_LABEL: Record<string, string> = {
    pending: "В очереди",
    synced: "Синхронизирован",
    sync_failed: "Ошибка, повтор через 15 мин",
    failed: "Не доставлен, нужна проверка",
  };

  const { data } = useQuery({ queryKey: ["admin-settings"], queryFn: () => get() });
  const { data: staff } = useQuery({ queryKey: ["admin-staff"], queryFn: () => staffList() });
  const { data: erp } = useQuery({
    queryKey: ["admin-erp-jobs"],
    queryFn: () => erpJobs() as Promise<{ rows: ErpJobRow[] }>,
  });

  const retryMutation = useMutation({
    mutationFn: () => retryErp(),
    onSuccess: (r) => {
      setMsg(`Обмен с 1С: обработано ${r.processed}, синхронизировано ${r.synced}`);
      qc.invalidateQueries({ queryKey: ["admin-erp-jobs"] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const [maintenance, setMaintenance] = useState({ enabled: false, message: "" });
  const [logistics, setLogistics] = useState({ fixed_rub: 0, percent: 0 });
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [newKey, setNewKey] = useState({ label: "", name: "", value: "" });
  const [email, setEmail] = useState("");
  const [role, setRoleValue] = useState<AdminRole>("manager");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setMaintenance(data.maintenance);
      setLogistics(data.logistics);
    }
  }, [data]);

  const settingMutation = useMutation({
    mutationFn: (v: { key: "maintenance_mode" | "logistics_markup"; value: Record<string, string | number | boolean> }) =>
      saveSetting({ data: v }),
    onSuccess: () => {
      setMsg("Настройки применены");
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const keyMutation = useMutation({
    mutationFn: (v: { name: string; value: string; label?: string }) => saveKey({ data: v }),
    onSuccess: () => {
      setMsg("Ключ зашифрован (AES-256-GCM) и сохранён");
      setKeyDrafts({});
      setNewKey({ label: "", name: "", value: "" });
      setAddOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (v: { name: string }) => deleteKey({ data: v }),
    onSuccess: () => {
      setMsg("Интеграция удалена");
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const roleMutation = useMutation({
    mutationFn: (v: { email: string; role: AdminRole; revoke: boolean }) => setRole({ data: v }),
    onSuccess: () => {
      setMsg("Права обновлены");
      setEmail("");
      qc.invalidateQueries({ queryKey: ["admin-staff"] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const card = "rounded-xl border bg-background p-6";
  const input = "rounded-md border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none";
  const btn =
    "cursor-pointer rounded-md bg-[#DC2626] px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-[#B91C1C] hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40";
  const ghostBtn =
    "cursor-pointer rounded-md border px-3 py-2 text-sm font-medium transition-all duration-200 hover:bg-muted hover:shadow-sm active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-bold">Системные настройки</h1>
      {msg && <div className="rounded-lg border bg-background px-4 py-3 text-sm">{msg}</div>}


      <div className="grid gap-6 lg:grid-cols-2">
        <div className={card}>
          <h2 className="mb-4 font-semibold">Глобальные переменные</h2>
          <label className="mb-3 flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={maintenance.enabled}
              onChange={(e) => setMaintenance((m) => ({ ...m, enabled: e.target.checked }))}
              className="h-4 w-4 cursor-pointer accent-[#DC2626]"
            />
            Режим технических работ
          </label>
          <textarea
            value={maintenance.message}
            onChange={(e) => setMaintenance((m) => ({ ...m, message: e.target.value }))}
            rows={2}
            className={`${input} mb-3 w-full`}
            placeholder="Текст для посетителей"
          />
          <button className={btn} onClick={() => settingMutation.mutate({ key: "maintenance_mode", value: maintenance })}>
            Сохранить режим
          </button>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <label className="text-sm">
              Наценка логистики, ₽
              <input
                value={logistics.fixed_rub}
                onChange={(e) => setLogistics((l) => ({ ...l, fixed_rub: Number(e.target.value) || 0 }))}
                inputMode="decimal"
                className={`${input} mt-1 w-full`}
              />
            </label>
            <label className="text-sm">
              Наценка логистики, %
              <input
                value={logistics.percent}
                onChange={(e) => setLogistics((l) => ({ ...l, percent: Number(e.target.value) || 0 }))}
                inputMode="decimal"
                className={`${input} mt-1 w-full`}
              />
            </label>
          </div>
          <button
            className={`${btn} mt-3`}
            onClick={() => settingMutation.mutate({ key: "logistics_markup", value: logistics })}
          >
            Сохранить наценку
          </button>
        </div>

        <div className={card}>
          <h2 className="mb-1 font-semibold">Хранилище API-ключей</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Значения шифруются AES-256-GCM перед записью и расшифровываются только в момент запроса
            к сервису. Ключи в коде не хранятся — сменить их можно здесь без перезапуска.
          </p>
          <div className="space-y-5">
            {VAULT_GROUPS.map((groupName) => {
              const rows = (data?.vault ?? []).filter((k) => k.group === groupName);
              if (!rows.length) return null;
              return (
                <div key={groupName}>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {groupName}
                  </h3>
                  <div className="space-y-2">
                    {rows.map((k) => (
                      <div
                        key={k.name}
                        className="grid grid-cols-[150px_minmax(0,1fr)_auto] items-center gap-2 text-sm"
                      >
                        <span className="truncate" title={k.name}>
                          {k.label}
                        </span>
                        <span className="relative block w-full">
                          <input
                            type={shown[k.name] ? "text" : "password"}
                            autoComplete="new-password"
                            value={keyDrafts[k.name] ?? ""}
                            onChange={(e) =>
                              setKeyDrafts((d) => ({ ...d, [k.name]: e.target.value }))
                            }
                            placeholder={k.masked ?? "не задан"}
                            className={`${input} w-full pr-10`}
                          />
                          <button
                            type="button"
                            aria-label={shown[k.name] ? "Скрыть ключ" : "Показать ключ"}
                            title={shown[k.name] ? "Скрыть ключ" : "Показать ключ"}
                            onClick={() => setShown((s) => ({ ...s, [k.name]: !s[k.name] }))}
                            className="absolute inset-y-0 right-0 grid w-10 cursor-pointer place-items-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground"
                          >
                            {shown[k.name] ? (
                              <EyeOff className="size-4" strokeWidth={1.75} />
                            ) : (
                              <Eye className="size-4" strokeWidth={1.75} />
                            )}
                          </button>
                        </span>
                        <span className="flex items-center gap-1">
                          <button
                            disabled={!keyDrafts[k.name] || keyMutation.isPending}
                            onClick={() =>
                              keyMutation.mutate({ name: k.name, value: keyDrafts[k.name]! })
                            }
                            className={ghostBtn}
                          >
                            Сохранить
                          </button>
                          {"custom" in k && k.custom && (
                            <button
                              aria-label={`Удалить интеграцию ${k.label}`}
                              onClick={() => deleteMutation.mutate({ name: k.name })}
                              className="grid size-9 cursor-pointer place-items-center rounded-md border text-muted-foreground transition-all duration-200 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                            >
                              <Trash2 className="size-4" strokeWidth={1.75} />
                            </button>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Масштабирование без разработчика: новая интеграция добавляется прямо здесь. */}
          <div className="mt-5 border-t pt-4">
            {addOpen ? (
              <div className="space-y-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    value={newKey.label}
                    onChange={(e) => setNewKey((n) => ({ ...n, label: e.target.value }))}
                    placeholder="Название сервиса (например, SMS-шлюз)"
                    className={`${input} w-full`}
                  />
                  <input
                    value={newKey.name}
                    onChange={(e) =>
                      setNewKey((n) => ({
                        ...n,
                        name: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
                      }))
                    }
                    placeholder="Имя переменной: SMS_API_KEY"
                    className={`${input} w-full font-mono`}
                  />
                </div>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={newKey.value}
                  onChange={(e) => setNewKey((n) => ({ ...n, value: e.target.value }))}
                  placeholder="API-ключ"
                  className={`${input} w-full`}
                />
                <div className="flex gap-2">
                  <button
                    className={btn}
                    disabled={
                      newKey.name.length < 3 || newKey.value.length < 4 || keyMutation.isPending
                    }
                    onClick={() =>
                      keyMutation.mutate({
                        name: newKey.name,
                        value: newKey.value,
                        label: newKey.label,
                      })
                    }
                  >
                    {keyMutation.isPending ? "Шифруем…" : "Сохранить интеграцию"}
                  </button>
                  <button className={ghostBtn} onClick={() => setAddOpen(false)}>
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              <button className={ghostBtn} onClick={() => setAddOpen(true)}>
                <Plus className="mr-1 inline size-4 align-[-3px]" strokeWidth={2} />
                Добавить интеграцию
              </button>
            )}
          </div>
        </div>


      </div>

      <div className={card}>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="font-semibold">Обмен с 1С</h2>
          <span className="text-xs text-muted-foreground">
            Заказы уходят в 1С сразу; неудачные повторяются каждые 15 минут.
          </span>
          <button
            className={`${btn} ml-auto`}
            disabled={retryMutation.isPending}
            onClick={() => retryMutation.mutate()}
          >
            {retryMutation.isPending ? "Отправляем…" : "Повторить сейчас"}
          </button>
        </div>
        <ul className="space-y-2 text-sm">
          {(erp?.rows ?? []).map((j) => (
            <li key={j.id} className="flex flex-wrap items-center gap-3 border-b pb-2">
              <span className="font-medium tabular-nums">{j.order_number}</span>
              <span
                className={`rounded border px-2 py-0.5 text-xs ${
                  j.status === "synced"
                    ? "border-emerald-300 text-emerald-700"
                    : j.status === "failed"
                      ? "border-red-300 text-red-700"
                      : "border-amber-300 text-amber-700"
                }`}
              >
                {ERP_STATUS_LABEL[j.status] ?? j.status}
              </span>
              <span className="text-xs text-muted-foreground">попыток: {j.attempts}</span>
              {j.last_error && (
                <span className="w-full text-xs text-muted-foreground">{j.last_error}</span>
              )}
            </li>
          ))}
          {!erp?.rows.length && (
            <li className="text-xs text-muted-foreground">Очередь пуста — все заказы в 1С.</li>
          )}
        </ul>
      </div>


      <div className={card}>
        <h2 className="mb-4 font-semibold">Персонал и права доступа</h2>
        <div className="mb-4 flex flex-wrap gap-2">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Почта зарегистрированного сотрудника"
            className={`${input} min-w-[280px]`}
          />
          <select value={role} onChange={(e) => setRoleValue(e.target.value as AdminRole)} className={input}>
            {(["owner", "manager", "content"] as AdminRole[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <button className={btn} disabled={!email} onClick={() => roleMutation.mutate({ email, role, revoke: false })}>
            Выдать роль
          </button>
        </div>
        <ul className="space-y-2 text-sm">
          {(staff?.rows ?? []).map((s) => (
            <li key={s.id} className="flex items-center gap-3 border-b pb-2">
              <span className="font-medium">{s.email ?? s.user_id}</span>
              <span className="rounded border px-2 py-0.5 text-xs">{ROLE_LABEL[s.role as AdminRole]}</span>
              <button
                onClick={() =>
                  s.email && roleMutation.mutate({ email: s.email, role: s.role as AdminRole, revoke: true })
                }
                className="ml-auto rounded-md border px-3 py-1 text-xs transition-colors hover:bg-red-50 hover:text-red-700"
              >
                Отозвать
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
