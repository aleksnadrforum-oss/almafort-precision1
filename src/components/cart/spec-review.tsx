// Экран проверки импорта («светофор»): клиент видит каждую строку своего файла
// до того, как она попадёт в корзину, и разрешает конфликты прямо здесь.
import { useMemo, useState } from "react";
import { AlertTriangle, Check, CircleAlert, Factory, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { PRODUCTS } from "@/data/catalog";
import { extractColors, paletteForProduct, resolveColor } from "@/data/palettes";
import { formatPrice } from "@/lib/pricing";
import { applyPack } from "@/lib/spec-sanitize";
import { linePrice, productBySku, useCart, type ReviewRow } from "@/store/cart-store";
import { BulkRequestDialog } from "@/components/catalog/bulk-request-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type UiStatus = "valid" | "warning" | "error";

const stockOf = (sku: string | null) => (sku ? (productBySku(sku)?.stock.qty ?? 0) : 0);

function deriveUiStatus(r: ReviewRow): UiStatus {
  if (r.status === "ERROR" || r.status === "NEEDS_SIZE" || r.status === "NOT_FOUND") return "error";
  if (r.error) return "error";
  if (r.status === "AMBIGUOUS") return "warning";
  if (r.sku && r.quantity > stockOf(r.sku)) return "warning";
  const warningNote = r.notes.some(
    (n) =>
      n.includes("не заявлен в палитре") ||
      n.includes("не указан в файле") ||
      n.includes("Количество не распознано") ||
      n.includes("не указан диаметр"),
  );
  if (warningNote) return "warning";
  return "valid";
}

const STATUS_BG: Record<UiStatus, string> = {
  valid:
    "border-l-4 border-l-emerald-500 bg-white transition-colors duration-300",
  warning:
    "border-l-4 border-l-amber-400 bg-amber-50 transition-colors duration-300",
  error:
    "border-l-4 border-l-red-500 bg-red-50 transition-colors duration-300",
};

const STATUS_SELECT: Record<UiStatus, string> = {
  valid: "border border-gray-300 focus:border-gray-400 focus:ring-1 focus:ring-gray-200",
  warning:
    "border-2 border-amber-400 focus:border-amber-500 focus:ring-1 focus:ring-amber-200",
  error:
    "border-2 border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-200",
};

const btn =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-sm px-4 text-sm font-semibold transition-colors";

function isColorWarning(n: string) {
  return n.includes("не заявлен в палитре") || n.includes("не указан в файле");
}

export function SpecReview() {
  const review = useCart((s) => s.review);
  const setReview = useCart((s) => s.setReview);
  const commitReview = useCart((s) => s.commitReview);
  const existing = useCart((s) => s.lines);

  const [rows, setRows] = useState<ReviewRow[]>(() =>
    (review?.rows ?? []).map((r) => ({ ...r, uiStatus: r.uiStatus ?? deriveUiStatus(r) })),
  );
  const [conflict, setConflict] = useState(false);
  const [leadOpen, setLeadOpen] = useState(false);

  const injProduct = useMemo(() => PRODUCTS.find((p) => p.sku === "SRV-INJ") ?? PRODUCTS[0]!, []);

  if (!review) return null;

  const patch = (id: string, next: Partial<ReviewRow>) =>
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const merged = { ...r, ...next };
        return { ...merged, uiStatus: deriveUiStatus(merged as ReviewRow) };
      }),
    );

  const remove = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));

  const setQty = (r: ReviewRow, raw: string) => {
    const value = Number.parseInt(raw.replace(/\D/g, ""), 10);
    if (!Number.isFinite(value) || value <= 0) {
      patch(r.id, { quantity: 0, status: "ERROR", error: "Количество должно быть целым числом" });
      return;
    }
    const notes = r.notes.filter((n) => !n.startsWith("Количество не распознано") && !n.startsWith("Изменено до"));
    if (r.sku) {
      const packed = applyPack(r.sku, value);
      patch(r.id, {
        quantity: packed.qty,
        error: null,
        status: r.status === "ERROR" ? "MATCHED" : r.status,
        notes: packed.note ? [...notes, packed.note] : notes,
      });
      return;
    }
    patch(r.id, { quantity: value, error: null, notes, status: r.status === "ERROR" ? "NOT_FOUND" : r.status });
  };

  const pick = (r: ReviewRow, sku: string) => {
    const p = productBySku(sku);
    if (!p) return;
    const packed = applyPack(sku, r.quantity);
    // Цвет пересобираем под палитру выбранного артикула.
    const resolved = resolveColor(p, extractColors(r.originalString).colors);
    patch(r.id, {
      sku,
      color: resolved.color,
      colorRecognized: resolved.recognized,
      name: p.name,
      status: "MATCHED",
      score: 100,
      quantity: packed.qty,
      error: null,
      notes: packed.note
        ? [...r.notes.filter((n) => !n.startsWith("В исходном файле не указан")), packed.note]
        : r.notes.filter((n) => !n.startsWith("В исходном файле не указан")),
    });
  };

  const greens = rows.filter((r) => r.uiStatus === "valid" && r.sku);
  const resolved = rows.filter((r) => r.uiStatus === "valid");
  const unmatched = rows.filter((r) => r.status === "NOT_FOUND");
  const hasUnresolved = rows.some((r) => r.uiStatus !== "valid");

  const total = resolved.reduce((sum, r) => sum + linePrice(r.sku!, r.quantity).sum, 0);

  const doCommit = (mode: "merge" | "replace", only?: ReviewRow[]) => {
    const list = (only ?? resolved).filter((r) => r.sku);
    if (!list.length) {
      toast.error("Нет ни одной подтверждённой позиции");
      return;
    }
    commitReview(
      list.map((r) => ({
        sku: r.sku!,
        quantity: r.quantity,
        originalName: r.originalString,
        color: r.color,
      })),
      mode,
    );
    toast.success(`В корзину добавлено позиций: ${list.length}`);
  };

  const commitGuarded = (only?: ReviewRow[]) => {
    if (existing.length) {
      setConflict(true);
      return;
    }
    doCommit("merge", only);
  };

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-lg font-bold text-foreground">Проверка спецификации</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {review.fileName} — строк: {rows.length}
            {review.columnMap
              ? `. Артикулы найдены в столбце ${review.columnMap.sku ?? "—"}, наименование — ${
                  review.columnMap.name ?? "—"
                }, количество — ${review.columnMap.qty ?? "—"}. Всё верно?`
              : ""}
          </p>
          {review.truncated && (
            <p className="mt-1 text-sm font-medium text-[#B45309]">
              Файл обрезан до 5000 позиций. Разделите смету на две части.
            </p>
          )}
        </div>
        <button type="button" className="text-sm text-muted-foreground hover:text-foreground" onClick={() => setReview(null)}>
          <X className="mr-1 inline size-4" />
          Отменить импорт
        </button>
      </header>

      <div className="flex flex-wrap gap-2 border-b border-border px-5 py-3">
        <button
          type="button"
          className={`${btn} bg-primary text-primary-foreground disabled:opacity-40`}
          disabled={!greens.length || hasUnresolved}
          onClick={() => commitGuarded(greens)}
        >
          <Check className="size-4" /> Добавить все зелёные строки ({greens.length})
        </button>
        <button
          type="button"
          className={`${btn} border border-border bg-background text-foreground disabled:opacity-40`}
          disabled={!unmatched.length}
          onClick={() => setRows((prev) => prev.filter((r) => r.status !== "NOT_FOUND"))}
        >
          <Trash2 className="size-4" /> Удалить все ненайденные ({unmatched.length})
        </button>
        {unmatched.length > 0 && (
          <button
            type="button"
            className={`${btn} border border-[#D97706] bg-[#FFFBEB] text-[#92400E]`}
            onClick={() => setLeadOpen(true)}
          >
            <Factory className="size-4" /> Передать в инженерный отдел (литьё на заказ)
          </button>
        )}
      </div>

      {/* Мобильные карточки (<md) / классические строки спецификации (>=md) */}
      <ul className="px-4 py-3 md:divide-y md:divide-border md:px-0 md:py-0">
        {rows.map((r) => {
          const status = r.uiStatus ?? deriveUiStatus(r);
          const stock = stockOf(r.sku);
          const product = r.sku ? productBySku(r.sku) : undefined;
          const palette = product ? paletteForProduct(product) : null;
          const partial = Boolean(r.sku) && r.quantity > stock;
          const selectClass = `${STATUS_SELECT[status]} mt-2 h-11 w-full max-w-xs rounded-sm bg-background px-2 text-base`;
          return (
            <li
              key={r.id}
              className={`mb-3 rounded-xl border border-gray-100 p-4 shadow-sm md:mb-0 md:rounded-none md:border-0 md:px-5 md:py-4 md:shadow-none ${STATUS_BG[status]}`}
            >
              <div className="flex flex-col md:flex-row md:flex-wrap md:items-start md:justify-between md:gap-3">
                <div className="w-full min-w-0 md:w-auto md:flex-1">
                  <p className="break-words text-left text-sm leading-snug text-muted-foreground [overflow-wrap:break-word] [word-break:normal]">
                    {r.originalString}
                  </p>
                  <p className="mt-0.5 w-full break-words text-left text-sm font-medium leading-snug text-foreground [overflow-wrap:break-word] [word-break:normal] md:text-base md:font-semibold">
                    {r.sku ? `${r.name} (${r.sku})` : "Позиция не найдена в каталоге"}
                  </p>
                  {r.sku && r.color && (
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <span
                        aria-hidden
                        className="inline-block size-3.5 shrink-0 rounded-[3px] border border-black/15"
                        style={{ backgroundColor: r.color.hex === "transparent" ? "#F3F4F6" : r.color.hex }}
                      />
                      Цвет: {r.color.label}
                      {!r.colorRecognized && palette && palette.length > 1 ? " (по умолчанию)" : ""}
                    </p>
                  )}
                  {palette && palette.length > 1 && (
                    <select
                      className={selectClass}
                      value={r.color?.label ?? ""}
                      aria-label="Цвет позиции"
                      onChange={(e) => {
                        const sw = palette.find((x) => x.label === e.target.value);
                        if (!sw) return;
                        patch(r.id, {
                          color: { label: sw.label, hex: sw.hex },
                          colorRecognized: true,
                          notes: r.notes.filter((n) => !isColorWarning(n)),
                        });
                      }}
                    >
                      {palette.map((sw) => (
                        <option key={sw.label} value={sw.label}>
                          {sw.label}
                        </option>
                      ))}
                    </select>
                  )}
                  {r.error && (
                    <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-[#B91C1C]">
                      <CircleAlert className="size-4" /> {r.error}. Исправьте количество вручную.
                    </p>
                  )}
                  {r.notes.map((n) => (
                    <p key={n} className="mt-1 flex items-start gap-1.5 text-sm text-[#92400E]">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {n}
                    </p>
                  ))}
                  {partial && (
                    <p className="mt-1 text-sm font-medium text-[#92400E]">
                      Частично под заказ: на складе {stock.toLocaleString("ru-RU")} шт из{" "}
                      {r.quantity.toLocaleString("ru-RU")} шт.
                    </p>
                  )}
                  {r.status === "AMBIGUOUS" && (
                    <p className="mt-1 text-sm text-[#92400E]">Мы подобрали аналог. Подтверждаете?</p>
                  )}

                  {(r.status === "AMBIGUOUS" || r.status === "NEEDS_SIZE") && r.candidates.length > 0 && (
                    <select
                      className={`${selectClass} max-w-md`}
                      defaultValue=""
                      onChange={(e) => e.target.value && pick(r, e.target.value)}
                      aria-label="Выберите подходящий размер"
                    >
                      <option value="" disabled>
                        {r.status === "NEEDS_SIZE" ? "Выберите диаметр…" : "Выберите позицию каталога…"}
                      </option>
                      {r.candidates.map((c) => (
                        <option key={c.sku} value={c.sku}>
                          {c.name} ({c.sku}) — {c.dims}
                        </option>
                      ))}
                    </select>
                  )}
                  {r.status === "NOT_FOUND" && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Нестандартная деталь — изготовим литьём или 3D-печатью по вашим размерам.
                    </p>
                  )}
                </div>

                {/* Нижняя панель карточки на мобильных: количество, сумма, удаление */}
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-gray-100 pt-2.5 md:mt-0 md:justify-end md:gap-3 md:border-0 md:pt-0">
                  <input
                    className="h-9 w-24 rounded-lg border border-gray-200 bg-background px-2 text-center text-sm md:h-11 md:w-28 md:rounded-sm md:border-[#D1D5DB] md:text-base"
                    inputMode="numeric"
                    type="text"
                    value={r.quantity ? String(r.quantity) : ""}
                    onChange={(e) => setQty(r, e.target.value)}
                    aria-label="Количество"
                  />
                  <span className="whitespace-nowrap text-base font-semibold text-foreground md:w-32 md:text-right md:text-sm">
                    {r.sku ? formatPrice(linePrice(r.sku, r.quantity).sum) : "—"}
                  </span>
                  <button
                    type="button"
                    className="p-2 text-gray-400 transition hover:text-red-600 active:scale-95"
                    onClick={() => remove(r.id)}
                    aria-label="Удалить строку"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
        <p className="text-sm text-muted-foreground">
          К импорту готово позиций: <strong className="text-foreground">{resolved.length}</strong> на сумму{" "}
          <strong className="text-foreground">{formatPrice(total)}</strong> (оптовая колонка применяется
          автоматически)
        </p>
        <button
          type="button"
          className={`${btn} bg-primary text-primary-foreground disabled:opacity-40`}
          disabled={!resolved.length || hasUnresolved}
          onClick={() => commitGuarded()}
        >
          Перенести в корзину
        </button>
      </footer>

      <Dialog open={conflict} onOpenChange={(o) => !o && setConflict(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-left text-base font-bold leading-snug pr-3">
              В вашей корзине уже есть товары
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="py-2 text-sm text-muted-foreground">
            Очистить текущую корзину или добавить позиции из спецификации к существующим? Совпадающие
            артикулы будут просуммированы.
          </DialogBody>
          <DialogFooter className="sm:flex-col">
            <button
              type="button"
              className="h-11 w-full cursor-pointer rounded-xl bg-red-600 text-sm font-medium text-white transition-colors active:bg-red-700"
              onClick={() => {
                setConflict(false);
                doCommit("merge");
              }}
            >
              Добавить к текущей
            </button>
            <button
              type="button"
              className="h-11 w-full cursor-pointer rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 transition-colors active:bg-gray-100"
              onClick={() => {
                setConflict(false);
                doCommit("replace");
              }}
            >
              Очистить и заменить
            </button>
          </DialogFooter>

        </DialogContent>
      </Dialog>

      <BulkRequestDialog
        product={injProduct}
        open={leadOpen}
        onClose={() => setLeadOpen(false)}
        presetComment={`Позиции из спецификации ${review.fileName}, отсутствующие в каталоге:\n${unmatched
          .map((r) => `• ${r.originalString} — ${r.quantity} шт`)
          .join("\n")}`}
      />
    </section>
  );
}
