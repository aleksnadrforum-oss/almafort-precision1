/**
 * Зачистка персональных данных в технических логах (152-ФЗ).
 * ИНН, телефоны и e-mail не должны оседать в access/error-логах сервера.
 */
const PHONE = /(\+?\d[\d\-\s()]{9,17}\d)/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const INN = /\b\d{10}(\d{2})?\b/g;

export function maskPii(input: string): string {
  return input
    .replace(EMAIL, (m) => `${m.slice(0, 2)}***@***`)
    .replace(INN, (m) => `${m.slice(0, 4)}****${m.slice(-2)}`)
    .replace(PHONE, (m) => {
      const digits = m.replace(/\D/g, "");
      return digits.length >= 10 ? `+${digits.slice(0, 1)}*******${digits.slice(-2)}` : m;
    });
}

/** Безопасный лог: объекты сериализуются и маскируются. */
export function safeLog(scope: string, ...parts: unknown[]) {
  const text = parts
    .map((p) => (typeof p === "string" ? p : (() => {
      try {
        return JSON.stringify(p);
      } catch {
        return String(p);
      }
    })()))
    .join(" ");
  console.info(`[${scope}]`, maskPii(text));
}
