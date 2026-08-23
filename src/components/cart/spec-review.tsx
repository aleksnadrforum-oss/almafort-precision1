// Экран проверки импорта («светофор»): клиент видит каждую строку своего файла
// до того, как она попадёт в корзину, и разрешает конфликты прямо здесь.
import { useMemo, useState } from "react";
import { AlertTriangle, Check, CircleAlert, Factory, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { PRODUCTS } from "@/data/catalog";
import { formatPrice } from "@/lib/pricing";
import { applyPack } from "@/lib/spec-sanitize";
import { linePrice, productBySku, useCart, type ReviewRow } from "@/store/cart-store";
import { BulkRequestDialog } from "@/components/catalog/bulk-request-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Tone = "green" | "yellow" | "red" | "grey";

const stockOf = (sku: string | null) => (sku ? (productBySku(sku)?.stock.qty ?? 0) : 0);

function toneOf(r: ReviewRow): Tone {
  if (r.status === "ERROR") return "red";
  if (r.status === "NEEDS_SIZE") return "red";
  if (r.status === "NOT_FOUND") return "grey";
  if (r.status === "AMBIGUOUS") return "yellow";
  if (r.sku && r.quantity > stockOf(r.sku)) return "yellow";
  if (r.notes.length) return "yellow";
  return "green";
}

const TONE_BG: Record<Tone, string> = {
  green: "border-l-4 border-l-[#16A34A] bg-[#F2FBF5]",
  yellow: "border-l-4 border-l-[#D97706] bg-[#FFFBEB]",
  red: "border-l-4 border-l-[#DC2626] bg-[#FEF2F2]",
  grey: "border-l-4 border-l-[#9CA3AF] bg-[#F6F7F8]",
};

const btn =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-sm px-4 text-sm font-semibold transition-colors";

export function SpecReview() {
  const review = useCart((s) => s.review);
  const setReview = useCart((s) => s.setReview);
  const commitReview = useCart((s) => s.commitReview);
  const existing = useCart((s) => s.lines);

  const [rows, setRows] = useState<ReviewRow[]>(() => review?.rows ?? []);
  const [conflict, setConflict] = useState(false);
  const [leadOpen, setLeadOpen] = useState(false);

  const injProduct = useMemo(() => PRODUCTS.find((p) => p.sku === "SRV-INJ") ?? PRODUCTS[0]!, []);

  if (!review) return null;

  const patch = (id: string, next: Partial<ReviewRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...next } : r)));

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
    patch(r.id, {
      sku,
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

  const greens = rows.filter((r) => toneOf(r) === "green" && r.sku);
  const resolved = rows.filter((r) => r.sku && r.quantity > 0 && r.status !== "ERROR");
  const unmatched = rows.filter((r) => r.status === "NOT_FOUND");

  const total = resolved.reduce((sum, r) => sum + linePrice(r.sku!, r.quantity).sum, 0);

  const doCommit = (mode: "merge" | "replace", only?: ReviewRow[]) => {
    const list = (only ?? resolved).filter((r) => r.sku);
    if (!list.length) {
      toast.error("Нет ни одной подтверждённой позиции");
      return;
    }
    commitReview(
      list.map((r) => ({ sku: r.sku!, quantity: r.quantity, originalName: r.originalString })),
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
          disabled={!greens.length}
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

      <ul className="divide-y divide-border">
        {rows.map((r) => {
          const tone = toneOf(r);
          const stock = stockOf(r.sku);
          const partial = Boolean(r.sku) && r.quantity > stock;
          return (
            <li key={r.id} className={`px-5 py-4 ${TONE_BG[tone]}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-muted-foreground">{r.originalString}</p>
                  <p className="mt-0.5 text-base font-semibold text-foreground">
                    {r.sku ? `${r.name} (${r.sku})` : "Позиция не найдена в каталоге"}
                  </p>
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
                      className="mt-2 h-11 w-full max-w-md rounded-sm border border-[#D1D5DB] bg-background px-2 text-base"
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

                <div className="flex items-center gap-3">
                  <input
                    className="h-11 w-28 rounded-sm border border-[#D1D5DB] bg-background px-2 text-base"
                    inputMode="numeric"
                    type="text"
                    value={r.quantity ? String(r.quantity) : ""}
                    onChange={(e) => setQty(r, e.target.value)}
                    aria-label="Количество"
                  />
                  <span className="w-28 text-right text-sm font-semibold text-foreground">
                    {r.sku ? formatPrice(linePrice(r.sku, r.quantity).sum) : "—"}
                  </span>
                  <button
                    type="button"
                    className="text-muted-foreground transition-colors hover:text-primary"
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
          disabled={!resolved.length}
          onClick={() => commitGuarded()}
        >
          Перенести в корзину
        </button>
      </footer>

      <Dialog open={conflict} onOpenChange={(o) => !o && setConflict(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>В вашей корзине уже есть товары</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Очистить текущую корзину или добавить позиции из спецификации к существующим? Совпадающие
            артикулы будут просуммированы.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className={`${btn} bg-primary text-primary-foreground`}
              onClick={() => {
                setConflict(false);
                doCommit("merge");
              }}
            >
              Добавить к текущей
            </button>
            <button
              type="button"
              className={`${btn} border border-border bg-background text-foreground`}
              onClick={() => {
                setConflict(false);
                doCommit("replace");
              }}
            >
              Очистить и заменить
            </button>
          </div>
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
