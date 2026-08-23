/**
 * Маска телефона +7 (XXX) XXX-XX-XX.
 * Терпит вставку из буфера в любом виде: «8 902 922 97 34», «+7(902)922-97-34»,
 * автозаполнение iOS/Android и мусорные символы — всё сводится к одному формату.
 */
export function phoneDigits(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("8")) d = `7${d.slice(1)}`;
  if (d.startsWith("9") && d.length <= 10) d = `7${d}`;
  if (!d.startsWith("7")) d = `7${d}`;
  return d.slice(0, 11);
}

export function formatPhone(raw: string): string {
  const d = phoneDigits(raw);
  if (d.length <= 1) return raw.replace(/\D/g, "") === "" ? "" : "+7 ";
  const p = d.slice(1);
  let out = "+7";
  if (p.length) out += ` (${p.slice(0, 3)}`;
  if (p.length > 3) out += `) ${p.slice(3, 6)}`;
  if (p.length > 6) out += `-${p.slice(6, 8)}`;
  if (p.length > 8) out += `-${p.slice(8, 10)}`;
  return out;
}

export const isValidPhone = (raw: string) => phoneDigits(raw).length === 11;
