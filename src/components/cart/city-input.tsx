import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";

export type CityValue = { city: string; fiasId: string | null };

type Suggestion = { city: string; region: string; fiasId: string | null };

/** Инпут города с подсказками DaData (ФИАС/КЛАДР) и локальным фолбэком. */
export function CityInput({
  value,
  onChange,
}: {
  value: CityValue;
  onChange: (v: CityValue) => void;
}) {
  const [query, setQuery] = useState(value.city);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const picked = useRef(value.city);
  const debounced = useDebounce(query, 300);

  useEffect(() => {
    const q = debounced.trim();
    if (q.length < 2 || q === picked.current) {
      setItems([]);
      return;
    }
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/dadata/city", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q }),
          signal: ctrl.signal,
        });
        const json = (await res.json()) as { suggestions?: Suggestion[] };
        setItems(json.suggestions ?? []);
        setActive(-1);
        setOpen(true);
      } catch {
        /* тишина: подсказки не критичны */
      }
    })();
    return () => ctrl.abort();
  }, [debounced]);

  const pick = (s: Suggestion) => {
    picked.current = s.city;
    setQuery(s.city);
    setOpen(false);
    setItems([]);
    setActive(-1);
    onChange({ city: s.city, fiasId: s.fiasId });
  };

  return (
    <div className="relative mt-3 w-full max-w-[360px]">
      <MapPin
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        strokeWidth={1.75}
      />
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange({ city: e.target.value, fiasId: null });
        }}
        role="combobox"
        aria-expanded={open && items.length > 0}
        aria-controls="city-suggestions"
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `city-opt-${active}` : undefined}
        // Стрелки ведут по списку, Enter выбирает город и запускает перерасчёт, Esc закрывает.
        onKeyDown={(e) => {
          if (!open || !items.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => (i + 1) % items.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
          } else if (e.key === "Enter") {
            const item = items[active] ?? items[0];
            if (item) {
              e.preventDefault();
              pick(item);
            }
          } else if (e.key === "Escape") {
            setOpen(false);
            setActive(-1);
          }
        }}
        onFocus={() => items.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Город доставки — начните вводить"
        autoComplete="off"
        className="h-11 w-full rounded-sm border border-[#D1D5DB] pl-9 pr-3 text-sm outline-none transition-colors focus:border-foreground"
      />
      {open && items.length > 0 && (
        <ul id="city-suggestions" role="listbox" className="absolute z-20 mt-1 w-full overflow-hidden rounded-sm border border-border bg-card shadow-[0_10px_30px_oklch(0_0_0/0.12)]">
          {items.map((s, i) => (
            <li key={`${s.city}-${s.fiasId ?? s.region}`}>
              <button
                type="button"
                id={`city-opt-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
                className={`flex w-full cursor-pointer items-baseline justify-between gap-3 px-3 py-2 text-left text-sm transition-colors ${
                  i === active ? "bg-[#F1F5F9]" : "hover:bg-[#F8F9FA]"
                }`}
              >
                <span className="font-medium text-foreground">{s.city}</span>
                <span className="text-xs text-muted-foreground">{s.region}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
