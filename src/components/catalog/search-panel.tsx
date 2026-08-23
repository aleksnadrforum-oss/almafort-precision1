import { toast } from "sonner";
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, FileText, FolderTree, Package, Search, X } from "lucide-react";
import { CATEGORIES, PRODUCTS, type Product } from "@/data/catalog";
import { scoreMatch } from "@/lib/fuzzy-search";
import type { SearchHit } from "@/lib/search-index";
import { PhotoScanner } from "@/components/catalog/photo-scanner";
import { ModuleErrorBoundary } from "@/components/error-boundary";
import { QuoteRequestModal } from "@/components/catalog/quote-request-modal";
import { parseQuery } from "@/lib/query-parse";

type Props = {
  query: string;
  onQuery: (v: string) => void;
  onPick: (p: Product) => void;
  onScanChange: (scanning: boolean) => void;
};

export function SearchPanel({ query, onQuery, onPick, onScanChange }: Props) {
  const [open, setOpen] = useState(false);
  const [scan, setScan] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const [hits, setHits] = useState<SearchHit[]>([]);
  const [took, setTook] = useState<number | null>(null);

  // Drop-down стартует от 3 символов, запрос дебаунсится и отменяется при новом вводе.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setHits([]);
      setTook(null);
      return;
    }
    const ctrl = new AbortController();
    const t = window.setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}&limit=6`, { signal: ctrl.signal })
        .then((r) => r.json() as Promise<{ hits: SearchHit[]; took: number }>)
        .then((d) => {
          setHits(d.hits);
          setTook(d.took);
        })
        .catch(() => undefined);
    }, 120);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  const results = useMemo(() => {
    if (query.trim().length < 3)
      return { products: [], cats: [], docs: [], alternatives: [], parsed: null };
    const bySku = new Map(PRODUCTS.map((p) => [p.sku, p]));
    const products = hits.length
      ? hits.map((h) => bySku.get(h.sku)).filter((p): p is Product => Boolean(p))
      : PRODUCTS.map((p) => ({
          p,
          s: Math.max(scoreMatch(p.name, query), scoreMatch(p.sku, query), scoreMatch(p.dims, query)),
        }))
          .filter((r) => r.s > 0)
          .sort((a, b) => b.s - a.s)
          .slice(0, 5)
          .map((r) => r.p);

    const cats = CATEGORIES.filter((c) => scoreMatch(c, query) > 0).slice(0, 4);
    const docs = products.slice(0, 3).map((p) => `Чертёж DWG · ${p.sku}`);

    // Zero-state: вместо пустой выдачи — близкие по сущности альтернативы.
    const parsed = parseQuery(query);
    const alternatives =
      products.length > 0
        ? []
        : PRODUCTS.map((p) => ({
            p,
            s: Math.max(
              parsed.entity ? scoreMatch(p.name, parsed.entity) : 0,
              parsed.entity ? scoreMatch(p.category, parsed.entity) : 0,
              scoreMatch(p.category, query),
            ),
          }))
            .sort((a, b) => b.s - a.s)
            .slice(0, 3)
            .map((r) => r.p);

    return { products, cats, docs, alternatives, parsed };
  }, [query, hits]);

  const startScan = () => {
    setScan(true);
    onScanChange(true);
  };

  const stopScan = () => {
    setScan(false);
    onScanChange(false);
  };

  return (
    <div ref={wrapRef} className="relative z-30 mx-auto w-full lg:w-[60%]">
      <div className="flex items-center gap-3 rounded-lg border border-[#D1D5DB] bg-card px-4 py-3 focus-within:border-[#D1D5DB] focus-within:shadow-[0_0_0_3px_oklch(0.21_0.006_286/0.08)]">
        <Search className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
        <input
          ref={inputRef}
          maxLength={200}
          value={query}
          onChange={(e) => {
            onQuery(e.target.value);
            setOpen(e.target.value.trim().length >= 3);
          }}
          // Вставка столбца артикулов из Excel: берём первую позицию,
          // остальные показываем подсказкой, чтобы клиент не потерял список.
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            const rows = text
              .split(/[\r\n\t;]+/)
              .map((r) => r.trim())
              .filter(Boolean);
            if (rows.length < 2) return;
            e.preventDefault();
            onQuery(rows[0]!.slice(0, 200));
            setOpen(true);
            toast.info(
              `Вставлено ${rows.length} позиций. Ищем «${rows[0]}» — остальные удобнее загрузить файлом спецификации в корзине`,
            );
          }}
          onFocus={() => setOpen(query.trim().length >= 3)}
          placeholder="Введите артикул, название или параметры (например: крепеж сэндвич-панели 120мм)"
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          aria-label="Поиск по каталогу"
        />
        {query && (
          <button
            type="button"
            aria-label="Очистить"
            onClick={() => onQuery("")}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" strokeWidth={1.5} />
          </button>
        )}
        <button
          type="button"
          onClick={startScan}
          title="Поиск по фото детали или чертежу"
          aria-label="Поиск по фото детали или чертежу"
          className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-sm bg-[#F3F4F6] text-[oklch(0.4_0.01_264)] transition-colors duration-200 hover:bg-primary hover:text-primary-foreground"
        >
          <Camera className="size-4" strokeWidth={1.75} />
        </button>
      </div>

      {open && query.trim().length >= 3 && (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] grid gap-6 rounded-lg border border-border bg-card p-5 shadow-[0_16px_40px_oklch(0_0_0/0.08)] md:grid-cols-3">
          {results.parsed && (results.parsed.entity || results.parsed.size || results.parsed.finish || results.parsed.quantity) && (
            <ul className="flex flex-wrap gap-1.5 text-[11px] md:col-span-3">
          {[
            results.parsed.entity,
            results.parsed.standard,
            results.parsed.size,
            results.parsed.finish,
            results.parsed.quantity ? `${results.parsed.quantity} шт` : null,
          ]
            .filter(Boolean)
            .map((chip) => (
              <li
                key={chip as string}
                className="rounded-full bg-primary/10 px-2.5 py-1 font-semibold text-primary"
              >
                {chip}
              </li>
            ))}
        </ul>
      )}
          <div>
            <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Package className="size-3.5" strokeWidth={1.75} /> Товары
            </p>
            {results.products.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Точного совпадения нет. Похожие по назначению позиции:
                </p>
                <ul className="space-y-2">
                  {results.alternatives.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onPick(p);
                          setOpen(false);
                        }}
                        className="min-h-11 w-full truncate rounded-sm p-1.5 text-left text-sm text-foreground hover:bg-surface"
                      >
                        {p.name}
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => {
                    setCustomOpen(true);
                    setOpen(false);
                  }}
                  className="min-h-11 w-full cursor-pointer rounded-sm bg-primary px-4 py-3 text-xs font-bold text-primary-foreground"
                >
                  Изготовим под заказ по вашим чертежам — оставить заявку
                </button>
              </div>
            )}
            <ul className="space-y-2">
              {results.products.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(p);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-sm p-1.5 text-left hover:bg-surface"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-sm bg-surface text-[10px] font-semibold text-muted-foreground">
                      {p.sku.slice(0, 2)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {p.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {p.sku} · {p.price.toFixed(2)} ₽
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <FolderTree className="size-3.5" strokeWidth={1.75} /> Категории
            </p>
            <ul className="space-y-2 text-sm text-foreground">
              {(results.cats.length ? results.cats : CATEGORIES.slice(0, 3)).map((c) => (
                <li key={c}>
                  <button
                    type="button"
                    onClick={() => {
                      onQuery(c);
                      setOpen(false);
                    }}
                    className="hover:text-primary"
                  >
                    {c}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <FileText className="size-3.5" strokeWidth={1.75} /> Документация
              {took !== null && (
                <span className="ml-auto font-normal normal-case tracking-normal tabular-nums">
                  {took} мс
                </span>
              )}
            </p>
            <ul className="space-y-2 text-sm text-foreground">
              {results.docs.length === 0 && (
                <li className="text-muted-foreground">Нет совпадений</li>
              )}
              {results.docs.map((d) => (
                <li key={d} className="hover:text-primary">
                  {d}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <ModuleErrorBoundary title="Модуль ИИ-камеры" hint="Воспользуйтесь обычным поиском по каталогу.">
        <PhotoScanner open={scan} onClose={stopScan} />
      </ModuleErrorBoundary>
      {customOpen && (
        <QuoteRequestModal
          sku="ПОД ЗАКАЗ"
          name={query.trim() || "Изготовление по чертежу"}
          onClose={() => setCustomOpen(false)}
        />
      )}
    </div>
  );
}
