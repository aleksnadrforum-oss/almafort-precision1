import { useEffect, useRef, useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { innHint, isValidInn, sanitizeInn } from "@/lib/inn";

export type Party = {
  inn: string;
  kpp: string | null;
  name: string;
  fullName: string | null;
  legalAddress: string | null;
  postalCode: string | null;
  ogrn: string | null;
  director: string | null;
  directorPost: string | null;
  entityType: "LEGAL" | "INDIVIDUAL";
  status: string;
  blocked: boolean;
  source: "dadata" | "manual";
};

/**
 * Единый TIN Engine: только цифры, 10 или 12 знаков, автоподтяжка реквизитов
 * из DaData и жёсткая блокировка ликвидированных контрагентов.
 * Используется в корзине, B2B-кабинете и админке — правила везде одни.
 */
export function InnField({
  value,
  onChange,
  onParty,
  label = "ИНН организации",
  required = false,
  invalid = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onParty: (p: Party | null) => void;
  label?: string;
  required?: boolean;
  invalid?: boolean;
}) {
  const [party, setParty] = useState<Party | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastQuery = useRef("");
  const report = useRef(onParty);
  report.current = onParty;

  const digits = sanitizeInn(value);
  const valid = isValidInn(digits);

  useEffect(() => {
    if (!valid) {
      lastQuery.current = "";
      setParty(null);
      setError(null);
      report.current(null);
      return;
    }
    if (lastQuery.current === digits) return;
    lastQuery.current = digits;

    let cancelled = false;
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch("/api/dadata/party", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inn: digits }),
        });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(json?.error ?? "Не удалось проверить ИНН");
        const p = json.party as Party;
        setParty(p);
        report.current(p);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Реестр недоступен");
        setParty(null);
        report.current(null);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [digits, valid]);

  const showError = invalid || (digits.length > 0 && !valid);

  return (
    <div>
      <label className="block text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-primary"> *</span>}
        <span className="relative mt-1 block">
          <input
            value={digits}
            onChange={(e) => onChange(sanitizeInn(e.target.value))}
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            placeholder="10 или 12 цифр"
            aria-invalid={showError}
            className={`h-12 w-full rounded-md border bg-background px-4 text-base tabular-nums text-foreground outline-none focus:border-primary ${
              showError ? "border-primary" : "border-[#D1D5DB]"
            }`}
          />
          {busy && (
            <Loader2
              className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
              strokeWidth={2}
            />
          )}
        </span>
      </label>

      {showError && (
        <p className="mt-2 text-xs leading-[1.5] text-primary">
          {digits.length === 0
            ? "Некорректный формат. ИНН должен содержать 10 или 12 цифр"
            : innHint(digits)}
        </p>
      )}
      {error && !showError && <p className="mt-2 text-xs text-muted-foreground">{error}</p>}

      {party?.blocked && (
        <p className="mt-3 flex items-start gap-2 rounded-md bg-primary/10 p-3 text-xs leading-[1.5] font-semibold text-primary">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
          Данное юридическое лицо ликвидировано или находится в стадии банкротства. Выставление
          счёта невозможно.
        </p>
      )}

      {party && party.source === "dadata" && party.name && !party.blocked && (
        <dl className="mt-3 grid gap-1.5 rounded-md border border-border bg-surface p-4 text-xs leading-[1.5]">
          <Row term="Наименование" value={party.name} />
          {party.entityType === "LEGAL" && <Row term="КПП" value={party.kpp} />}
          <Row term={party.entityType === "LEGAL" ? "ОГРН" : "ОГРНИП"} value={party.ogrn} />
          <Row term="Юридический адрес" value={party.legalAddress} />
          <Row
            term={party.directorPost ?? "Руководитель"}
            value={party.director}
          />
        </dl>
      )}

      {party && party.source === "manual" && valid && (
        <p className="mt-2 text-xs text-muted-foreground">
          Реестр сейчас недоступен — реквизиты уточнит менеджер. Заказ оформляется как обычно.
        </p>
      )}
    </div>
  );
}

function Row({ term, value }: { term: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-[130px_1fr] gap-2">
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}
