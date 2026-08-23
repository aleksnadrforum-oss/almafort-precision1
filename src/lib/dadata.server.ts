/**
 * Реквизиты юрлица/ИП по ИНН через DaData (метод findById/party).
 * Токен читается из зашифрованного хранилища админки, с фолбеком на окружение.
 * Без токена — мягкая деградация: возвращаем каркас, клиент дозаполняет руками.
 */
import { secretValue } from "@/lib/vault.server";

export type PartyStatus = "ACTIVE" | "LIQUIDATING" | "LIQUIDATED" | "BANKRUPT" | "REORGANIZING";

export type PartyInfo = {
  inn: string;
  kpp: string | null;
  name: string;
  fullName: string | null;
  legalAddress: string | null;
  postalCode: string | null;
  ogrn: string | null;
  director: string | null;
  directorPost: string | null;
  /** LEGAL — ООО/АО (10 цифр), INDIVIDUAL — ИП (12 цифр). */
  entityType: "LEGAL" | "INDIVIDUAL";
  status: PartyStatus;
  /** true — счёт выставлять нельзя (ликвидация или банкротство). */
  blocked: boolean;
  source: "dadata" | "manual";
};

export async function dadataToken() {
  return secretValue("DADATA_API_KEY");
}

export async function findPartyByInn(inn: string): Promise<PartyInfo> {
  const entityType: PartyInfo["entityType"] = inn.length === 12 ? "INDIVIDUAL" : "LEGAL";
  const fallback: PartyInfo = {
    inn,
    kpp: null,
    name: "",
    fullName: null,
    legalAddress: null,
    postalCode: null,
    ogrn: null,
    director: null,
    directorPost: null,
    entityType,
    status: "ACTIVE",
    blocked: false,
    source: "manual",
  };

  const token = await dadataToken();
  if (!token) return fallback;

  const res = await fetch("https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Token ${token}`,
    },
    body: JSON.stringify({ query: inn, count: 1 }),
  });
  if (!res.ok) {
    console.error(`[dadata] findById failed [${res.status}]`);
    return fallback;
  }

  const json = (await res.json()) as {
    suggestions?: Array<{
      value?: string;
      data?: {
        inn?: string;
        kpp?: string;
        ogrn?: string;
        type?: string;
        state?: { status?: string };
        address?: { unrestricted_value?: string; value?: string; data?: { postal_code?: string } };
        name?: { short_with_opf?: string; full_with_opf?: string };
        management?: { name?: string; post?: string };
        fio?: { surname?: string; name?: string; patronymic?: string };
      };
    }>;
  };
  const s = json.suggestions?.[0];
  if (!s?.data) return fallback;
  const d = s.data;

  const rawStatus = String(d.state?.status ?? "ACTIVE").toUpperCase();
  const status: PartyStatus = (
    ["ACTIVE", "LIQUIDATING", "LIQUIDATED", "BANKRUPT", "REORGANIZING"] as const
  ).includes(rawStatus as PartyStatus)
    ? (rawStatus as PartyStatus)
    : "ACTIVE";

  return {
    inn: d.inn ?? inn,
    kpp: d.type === "INDIVIDUAL" ? null : (d.kpp ?? null),
    name: d.name?.short_with_opf ?? s.value ?? "",
    fullName: d.name?.full_with_opf ?? null,
    legalAddress: d.address?.unrestricted_value ?? d.address?.value ?? null,
    postalCode: d.address?.data?.postal_code ?? null,
    ogrn: d.ogrn ?? null,
    director:
      d.management?.name ??
      ([d.fio?.surname, d.fio?.name, d.fio?.patronymic].filter(Boolean).join(" ") || null),
    directorPost: d.management?.post ?? null,
    entityType: d.type === "INDIVIDUAL" ? "INDIVIDUAL" : "LEGAL",
    status,
    // Ликвидированному или банкротящемуся контрагенту счёт не выставляем.
    blocked: status === "LIQUIDATED" || status === "BANKRUPT",
    source: "dadata",
  };
}
