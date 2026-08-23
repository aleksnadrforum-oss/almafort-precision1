/**
 * Валидация ИНН: 10 цифр — юрлицо (ООО, АО), 12 цифр — ИП.
 * Единое правило для кабинета, корзины и админки.
 */
export const INN_REGEX = /^\d{10}(\d{2})?$/;

export const sanitizeInn = (v: string) => v.replace(/\D/g, "").slice(0, 12);

export const isValidInn = (v: string) => INN_REGEX.test(v.trim());

export const innHint = (v: string) => {
  const digits = sanitizeInn(v);
  if (!digits) return "Введите ИНН: 10 цифр для юрлица или 12 для ИП.";
  if (isValidInn(digits)) return null;
  return digits.length < 10
    ? `Не хватает ${10 - digits.length} цифр: ИНН юрлица — 10 знаков, ИП — 12.`
    : "ИНН содержит 10 цифр (юрлицо) или 12 цифр (ИП). Проверьте номер.";
};
