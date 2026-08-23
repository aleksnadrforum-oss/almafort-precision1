import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Sparkles, Calculator, FileText, ShieldCheck, Wrench, Download, Link2, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/store/cart-store";
import { PRODUCTS, isOnRequest, tierOf } from "@/data/catalog";
import { unitPriceOf, lineTotal, formatPrice } from "@/lib/pricing";
import { ProductThumb } from "@/components/catalog/product-thumb";
import { generateSpecPdfInBrowser } from "@/lib/pdf-browser";

type SolutionItem = {
  sku: string;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  tier: 0 | 1 | 2;
  base_price: number;
  on_request: boolean;
  image_url: string | null;
  dims: string;
};

type ApiResult = {
  solution: {
    recommended_items: SolutionItem[];
    engineering_logic: string;
    safety_margin_factor: number | null;
    is_service: boolean;
    total: number;
    warnings?: string[];
    clarification?: string[];
  };
  sources: Array<{ id: string; title: string }>;
};

const EXAMPLES = [
  "Закрепить блок промышленного кондиционера весом 150 кг на сэндвич-панель",
  "Нужны регулируемые опоры для торговых стеллажей: 50 стеллажей по 250 кг, по 4 опоры",
  "Закрыть торцы профильной трубы 80х80 в ограждении цеха, 1200 точек",
  "Опереть трубопровод Ø108 мм на кровлю без пробивки гидроизоляции",
];

/** Резьба из названия/размеров: «Болт М10х30» → "М10". */
function threadOf(text: string): string | null {
  const m = text.toLowerCase().match(/(?:^|[^a-zа-я0-9])[мm]\s?(\d{1,3})(?:[\s.,]|[хx*]|$)/i);
  return m ? `М${m[1]}` : null;
}

/** Класс изделия — резьбовые пары проверяются на совпадение диаметра. */
function kindOf(name: string): "bolt" | "nut" | "washer" | "other" {
  const n = name.toLowerCase();
  if (/гайк/.test(n)) return "nut";
  if (/шайб/.test(n)) return "washer";
  if (/болт|винт|шпильк|саморез|анкер/.test(n)) return "bolt";
  return "other";
}

/** Компактная сериализация конфигурации для ссылки-шеринга. */
function encodeConfig(data: unknown): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(data))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function decodeConfig<T>(raw: string): T | null {
  try {
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(escape(atob(b64)))) as T;
  } catch {
    return null;
  }
}

const TIER_LABEL: Record<1 | 2, string> = { 1: "Опт 1", 2: "Опт 2" };

export function AiConfigurator() {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const addLine = useCart((s) => s.addLine);
  const [shared, setShared] = useState(false);
  const [fallback, setFallback] = useState<string | null>(null);
  // Прошлый шаг диалога: «а если труба 60х60?» считается от него.
  const [history, setHistory] = useState<{ query: string; items: Array<{ sku: string; quantity: number }> } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [stage, setStage] = useState(0);
  const [typed, setTyped] = useState("");

  // Восстановление конфигурации по ссылке: инженер открывает узел ровно в том
  // составе, в котором его сохранил снабженец.
  const sharedTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(sharedTimer.current), []);

  // Живой статус вместо «зависшего» лоадера: запрос к модели идёт до 15 секунд.
  const STAGES = [
    "Разбираем задачу и единицы измерения…",
    "Анализируем нагрузки и основание…",
    "Подбираем артикулы по каталогу…",
    "Считаем оптовые пороги и смету…",
  ];
  useEffect(() => {
    if (!busy) {
      setStage(0);
      return;
    }
    const id = window.setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 2600);
    return () => window.clearInterval(id);
  }, [busy]);

  // Побуквенный вывод обоснования — ответ «печатается», а не появляется рывком.
  const logic = result?.solution.engineering_logic ?? "";
  useEffect(() => {
    if (!logic) {
      setTyped("");
      return;
    }
    setTyped("");
    let i = 0;
    const id = window.setInterval(() => {
      i = Math.min(i + 4, logic.length);
      setTyped(logic.slice(0, i));
      if (i >= logic.length) window.clearInterval(id);
    }, 16);
    return () => window.clearInterval(id);
  }, [logic]);

  // Прерывание генерации при уходе со страницы — токены не жжём.
  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("cfg");
    if (!raw) return;
    type Saved = { q: string; l: string; s: number | null; i: Array<[string, number]> };
    const saved = decodeConfig<Saved>(raw);
    if (!saved?.i?.length) return;
    const items: SolutionItem[] = saved.i
      .map(([sku, quantity]): SolutionItem | null => {
        const p = PRODUCTS.find((x) => x.sku === sku);
        if (!p) return null;
        return {
          sku,
          name: p.name,
          quantity,
          unit_price: 0,
          total_price: 0,
          tier: 0 as const,
          base_price: p.price,
          on_request: isOnRequest(p),
          image_url: p.image_url,
          dims: p.dims,
        };
      })
      .filter((x): x is SolutionItem => Boolean(x));
    if (!items.length) return;
    setQuery(saved.q ?? "");
    setQty(Object.fromEntries(saved.i));
    setResult({
      solution: {
        recommended_items: items,
        engineering_logic: saved.l ?? "Конфигурация восстановлена по ссылке.",
        safety_margin_factor: saved.s ?? null,
        is_service: false,
        total: 0,
      },
      sources: [{ id: "shared", title: "сохранённая конфигурация" }],
    });
    document.getElementById("configurator")?.scrollIntoView({ behavior: "smooth" });
  }, []);

  /** Пересчёт спецификации на лету: цена всегда берётся из каталога, не из ответа ИИ. */
  const rows = useMemo(() => {
    const items = result?.solution.recommended_items ?? [];
    return items.map((item) => {
      const p = PRODUCTS.find((x) => x.sku === item.sku);
      const q = Math.max(1, Math.floor(qty[item.sku] ?? item.quantity));
      if (!p) return { ...item, quantity: q };
      const onRequest = isOnRequest(p);
      return {
        ...item,
        quantity: q,
        on_request: onRequest,
        unit_price: onRequest ? 0 : unitPriceOf(p, q),
        total_price: onRequest ? 0 : lineTotal(p, q),
        tier: onRequest ? (0 as const) : tierOf(q, p),
      };
    });
  }, [result, qty]);

  const total = rows.reduce((s, r) => s + r.total_price, 0);

  /** Логический контроль узла: резьба болта и гайки/шайбы обязана совпадать. */
  const conflict = useMemo(() => {
    const threads = new Map<string, string[]>();
    for (const r of rows) {
      const kind = kindOf(r.name);
      if (kind === "other") continue;
      const th = threadOf(`${r.name} ${r.dims}`);
      if (!th) continue;
      threads.set(th, [...(threads.get(th) ?? []), r.name]);
    }
    if (threads.size <= 1) return null;
    return `Диаметр резьбы не совпадает: ${[...threads.keys()].join(" и ")}. Узел собран неверно — приведите позиции к одному диаметру.`;
  }, [rows]);
  const isService = Boolean(result?.solution.is_service);
  const warnings = result?.solution.warnings ?? [];
  const clarification = result?.solution.clarification ?? [];

  const solve = async (text: string, followUp = false) => {
    const min = followUp ? 3 : 10;
    if (text.trim().length < min) {
      toast.error("Опишите задачу подробнее: объект, масса, основание.");
      return;
    }
    if (busy) return; // защита от многократного нажатия «Подобрать решение»
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setResult(null);
    setFallback(null);
    setQty({});
    try {
      const res = await fetch("/api/configurator/solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          query: text.trim(),
          history: followUp ? history : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        // Сервис ИИ недоступен — извиняемся и уводим к живому инженеру,
        // а не показываем клиенту код ошибки.
        if (res.status >= 500 || json?.fallback) {
          setFallback(
            typeof json?.error === "string" && json.error.length > 10
              ? `${json.error} Опишите задачу в свободной форме — живой инженер подберёт смету в течение 10 минут.`
              : "ИИ-инженер сейчас перегружен. Оставьте заявку в свободной форме — живой специалист подберёт смету в течение 10 минут.",
          );
          return;
        }

        throw new Error(json?.error ?? "Не удалось подобрать решение");
      }
      const data = json as ApiResult;
      setResult(data);
      if (data.solution.recommended_items.length > 0) {
        setHistory({
          query: text.trim(),
          items: data.solution.recommended_items.map((i) => ({ sku: i.sku, quantity: i.quantity })),
        });
      }
    } catch (e) {
      // Отмена пользователем — не ошибка сервиса.
      if (e instanceof DOMException && e.name === "AbortError") return;
      setFallback(
        "Связь с ИИ-инженером прервалась. Оставьте заявку в свободной форме — живой специалист подберёт смету в течение 10 минут.",
      );
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  };

  const stopGeneration = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    toast.info("Генерация остановлена");
  };

  const shareUrl = () => {
    const url = new URL(window.location.href);
    url.searchParams.set(
      "cfg",
      encodeConfig({
        q: query,
        l: result?.solution.engineering_logic ?? "",
        s: result?.solution.safety_margin_factor ?? null,
        i: rows.map((r) => [r.sku, r.quantity]),
      }),
    );
    url.hash = "configurator";
    return url.toString();
  };

  const copyLink = async () => {
    const link = shareUrl();
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      window.prompt("Скопируйте ссылку на конфигурацию", link);
    }
    setShared(true);
    window.clearTimeout(sharedTimer.current);
    sharedTimer.current = window.setTimeout(() => setShared(false), 2500);
    toast.success("Ссылка на конфигурацию скопирована");
  };

  const downloadPdf = async () => {
    try {
      await generateSpecPdfInBrowser({
        task: query || "Подбор узла",
        logic: result?.solution.engineering_logic ?? "",
        safety: result?.solution.safety_margin_factor ?? null,
        rows: rows.map((r) => ({
          sku: r.sku,
          name: r.name,
          dims: r.dims,
          quantity: r.quantity,
          unit_price: r.unit_price,
          total_price: r.total_price,
          on_request: r.on_request,
        })),
        total,
        shareUrl: shareUrl(),
      });
    } catch {
      toast.error("Не удалось сформировать PDF-смету");
    }
  };

  const transferToCart = () => {
    if (conflict) {
      toast.error(conflict);
      return;
    }
    const payable = rows.filter((r) => !r.on_request);
    if (payable.length === 0) return;
    for (const r of payable) addLine(r.sku, r.quantity);
    toast.success(`Спецификация в корзине: ${payable.length} поз. на ${formatPrice(total)}`);
  };

  const scrollToQuiz = () => {
    const el = document.getElementById("quiz");
    // Квиз-терминал живёт на главной: с других маршрутов уходим по якорю.
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    else window.location.assign("/#quiz");
  };

  return (
    <section
      id="configurator"
      aria-label="ИИ-конфигуратор инженерных узлов и смет"
      className="mt-16 scroll-mt-28 rounded-lg bg-[#F3F4F6] p-5 sm:p-8 lg:p-10"
    >
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-sm bg-primary text-primary-foreground">
          <Sparkles className="size-5" strokeWidth={1.75} />
        </span>
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-foreground lg:text-2xl">
            ИИ-конфигуратор узла и сметы
          </h2>
          <p className="text-sm text-muted-foreground">
            Опишите задачу словами — подберём артикулы, посчитаем запас прочности и оптовую цену.
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 lg:flex-row">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value.slice(0, 1000))}
          maxLength={1000}
          rows={3}
          placeholder="Например: закрепить кондиционер 150 кг на сэндвич-панель"
          className="flex-1 resize-none rounded-sm border border-[#D1D5DB] bg-card p-4 text-sm leading-[1.5] text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <button
          type="button"
          onClick={() => solve(query, Boolean(history))}
          disabled={busy}
          className="flex h-fit min-h-[52px] w-full cursor-pointer items-center justify-center gap-2 rounded-sm bg-primary px-7 py-4 lg:w-auto text-sm font-semibold text-primary-foreground shadow-[0_6px_18px_-6px_oklch(0.573_0.221_27.5/0.55)] transition-[background-color,transform,box-shadow] duration-200 hover:bg-[#B91C1C] hover:shadow-[0_10px_24px_-8px_oklch(0.573_0.221_27.5/0.7)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Calculator className="size-4" />}
          {busy ? "Инженерный анализ…" : history ? "Пересчитать" : "Подобрать решение"}
        </button>
        {busy && (
          <button
            type="button"
            onClick={stopGeneration}
            aria-label="Остановить генерацию"
            className="flex h-fit min-h-[52px] w-full cursor-pointer items-center justify-center gap-2 rounded-sm border border-[#D1D5DB] bg-card px-5 text-sm font-semibold text-foreground lg:w-auto"
          >
            <X className="size-4" /> Остановить
          </button>
        )}
      </div>

      {busy && (
        <div className="mt-4 rounded-sm border border-[#D1D5DB] bg-card p-4" role="status" aria-live="polite">
          <p className="text-sm font-semibold text-foreground">{STAGES[stage]}</p>
          <div className="mt-3 space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-3 animate-pulse rounded-sm bg-[#E5E7EB]" style={{ width: `${100 - i * 18}%` }} />
            ))}
          </div>
        </div>
      )}

      {history && !busy && (
        <p className="mt-3 text-xs text-muted-foreground">
          Диалог с контекстом: можно уточнить прошлую смету — например «а если труба квадратная
          60х60?». Количество из предыдущего расчёта сохранится.
        </p>
      )}

      <ul className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <li key={ex}>
            <button
              type="button"
              onClick={() => {
                setQuery(ex);
                void solve(ex);
              }}
              className="cursor-pointer rounded-full border border-[#D1D5DB] bg-card px-3.5 py-2 text-xs text-muted-foreground transition-all duration-200 hover:border-[#E52421] hover:bg-[#FEF2F2] hover:text-[#E52421] hover:shadow-[0_4px_6px_rgba(0,0,0,0.05)] active:scale-[0.97]"
            >
              {ex.length > 64 ? `${ex.slice(0, 64)}…` : ex}
            </button>
          </li>
        ))}
      </ul>

      {busy && (
        <div className="mt-8 space-y-3" aria-live="polite">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            Инженер ИИ считает решение
            <span className="flex items-end gap-1 pb-[3px]">
              <span className="typing-dot size-1.5 rounded-full bg-current" />
              <span className="typing-dot size-1.5 rounded-full bg-current" />
              <span className="typing-dot size-1.5 rounded-full bg-current" />
            </span>
          </p>
          {/* Скелет резервирует высоту ответа — интерфейс не «прыгает» при загрузке */}
          <div className="skeleton h-6 w-1/3" aria-hidden />
          <div className="skeleton h-24" aria-hidden />
          <div className="skeleton h-12 w-2/3" aria-hidden />
        </div>
      )}


      {fallback && (
        <div
          role="status"
          className="mt-8 flex flex-col gap-3 rounded-lg border border-[#D1D5DB] bg-card p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
        >
          <p className="text-sm leading-[1.6] text-foreground">{fallback}</p>
          <button
            type="button"
            onClick={scrollToQuiz}
            className="min-h-11 shrink-0 cursor-pointer rounded-sm bg-primary px-6 text-sm font-bold text-primary-foreground hover:bg-[#B91C1C]"
          >
            Оставить заявку инженеру
          </button>
        </div>
      )}

      {result && clarification.length > 0 && (
        <div className="mt-8 rounded-lg border border-[#D1D5DB] bg-card p-5 sm:p-6">
          <p className="text-sm font-bold text-foreground">
            {result.solution.engineering_logic}
          </p>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-[1.6] text-foreground">
            {clarification.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">
            Допишите эти данные в задачу и нажмите «Подобрать решение» — расчёт будет точным.
          </p>
        </div>
      )}

      {result && rows.length === 0 && clarification.length === 0 && (
        <div className="mt-8 rounded-lg border border-[#D1D5DB] bg-card p-5 sm:p-6">
          <p className="whitespace-pre-line text-sm leading-[1.7] text-foreground">
            {result.solution.engineering_logic}
          </p>
          <button
            type="button"
            onClick={scrollToQuiz}
            className="mt-4 min-h-11 cursor-pointer rounded-sm bg-primary px-6 text-sm font-bold text-primary-foreground hover:bg-[#B91C1C]"
          >
            Заявка на инженерный расчёт
          </button>
        </div>
      )}

      {result && rows.length > 0 && (
        <article className="mt-8 overflow-hidden rounded-lg bg-card shadow-[0_16px_40px_oklch(0_0_0/0.08)]">
          {/* Инженерное обоснование */}
          <div className="bg-[#F8F9FA] p-5 sm:p-8">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              <ShieldCheck className="size-4" strokeWidth={1.75} /> Инженерное обоснование
            </p>
            <p className="mt-3 whitespace-pre-line font-mono text-[13px] leading-[1.7] tabular-nums text-foreground">
              {typed || result.solution.engineering_logic}
            </p>
            {result.solution.safety_margin_factor !== null && (
              <p className="mt-4 inline-flex items-center gap-2 rounded-sm bg-[#E8F5E9] px-3 py-1.5 text-xs font-bold tabular-nums text-[#1B5E20]">
                Запас прочности: {result.solution.safety_margin_factor}×
              </p>
            )}
          </div>

          {/* Спецификация */}
          <div className="border-t border-border p-5 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Спецификация
            </p>
            <ul className="mt-4 divide-y divide-border">
              {rows.map((r) => (
                <li
                  key={r.sku}
                  className="grid grid-cols-[56px_minmax(0,1fr)] items-center gap-4 py-4 lg:grid-cols-[56px_minmax(0,1fr)_110px_150px_130px]"
                >
                  <ProductThumb src={r.image_url} alt={r.name} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{r.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {r.sku} · {r.dims}
                    </p>
                  </div>
                  <div className="col-start-2 lg:col-start-3">
                    <input
                      type="number"
                      min={1}
                      inputMode="numeric"
                      aria-label={`Количество ${r.sku}`}
                      value={r.quantity}
                      onChange={(e) => {
                        const v = Math.max(1, Math.floor(Number(e.target.value) || 1));
                        setQty((prev) => ({ ...prev, [r.sku]: v }));
                      }}
                      className="h-12 w-full rounded-sm border border-[#D1D5DB] bg-card px-3 text-sm tabular-nums md:h-auto md:py-2 text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="col-start-2 lg:col-start-4 lg:text-right">
                    {r.on_request ? (
                      <span className="text-sm font-semibold text-muted-foreground">
                        По договорённости
                      </span>
                    ) : (
                      <>
                        <span className="text-sm tabular-nums text-foreground">
                          {formatPrice(r.unit_price)}/шт
                        </span>
                        {r.tier > 0 && (
                          <span className="ml-2 inline-block rounded-sm bg-[#E8F5E9] px-2 py-0.5 text-[11px] font-bold text-[#1B5E20]">
                            {TIER_LABEL[r.tier as 1 | 2]}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  <div className="col-start-2 text-sm font-bold tabular-nums text-foreground lg:col-start-5 lg:text-right">
                    {r.on_request ? "—" : formatPrice(r.total_price)}
                  </div>
                </li>
              ))}
            </ul>

            {conflict && (
              <p
                role="alert"
                className="mt-4 flex items-start gap-2 rounded-sm border border-primary bg-[#FEF2F2] p-3 text-sm font-semibold leading-[1.5] text-primary"
              >
                <TriangleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
                {conflict}
              </p>
            )}

            {warnings.length > 0 && (
              <ul className="mt-4 space-y-2">
                {warnings.map((w) => (
                  <li
                    key={w}
                    className="flex items-start gap-2 rounded-sm bg-[#FFF7ED] p-3 text-xs leading-[1.5] text-[#9A3412]"
                  >
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
                    {w}
                  </li>
                ))}
              </ul>
            )}

            {!isService && (
              <p className="mt-4 text-right text-sm font-bold tabular-nums text-foreground">
                Итого: {formatPrice(total)}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-4 border-t border-border p-5 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void downloadPdf()}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-sm border border-[#D1D5DB] bg-card px-4 text-sm font-semibold text-foreground hover:border-primary hover:text-primary"
              >
                <Download className="size-4" strokeWidth={1.75} />
                Скачать PDF-смету
              </button>
              <button
                type="button"
                onClick={() => void copyLink()}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-sm border border-[#D1D5DB] bg-card px-4 text-sm font-semibold text-foreground hover:border-primary hover:text-primary"
              >
                <Link2 className="size-4" strokeWidth={1.75} />
                {shared ? "Ссылка скопирована" : "Скопировать ссылку на конфигурацию"}
              </button>
            </div>

            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileText className="size-4 shrink-0" strokeWidth={1.75} />
              Источники: {result.sources.map((s) => s.title).join("; ") || "каталог ALMAFORT"}
            </p>
            {isService ? (
              <button
                type="button"
                onClick={scrollToQuiz}
                className="flex min-h-[52px] w-full cursor-pointer items-center justify-center gap-2 rounded-sm bg-primary px-8 py-4 lg:w-auto text-sm font-bold text-primary-foreground shadow-[0_6px_18px_-6px_oklch(0.573_0.221_27.5/0.55)] transition-[background-color,transform,box-shadow] duration-200 hover:bg-[#B91C1C] hover:shadow-[0_10px_24px_-8px_oklch(0.573_0.221_27.5/0.7)] active:scale-[0.97]"
              >
                <Wrench className="size-4" strokeWidth={2} />
                Прикрепить ТЗ и запросить расчёт
              </button>
            ) : (
              <button
                type="button"
                onClick={transferToCart}
                disabled={Boolean(conflict)}
                className="disabled:cursor-not-allowed disabled:opacity-50 min-h-[52px] w-full cursor-pointer rounded-sm bg-primary px-8 py-4 lg:w-auto text-sm font-bold text-primary-foreground shadow-[0_6px_18px_-6px_oklch(0.573_0.221_27.5/0.55)] transition-all duration-200 hover:scale-[1.02] hover:bg-[#B91C1C] hover:shadow-[0_10px_24px_-8px_oklch(0.573_0.221_27.5/0.7)] active:scale-[0.98]"
              >
                Добавить смету в корзину
              </button>

            )}
          </div>
        </article>
      )}
    </section>
  );
}
