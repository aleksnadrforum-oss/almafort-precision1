/**
 * Требования к паролю кабинета B2B.
 * Хэширование выполняет бэкенд авторизации (bcrypt, соль на пользователя) —
 * задача фронта: не пропустить «123456», «password» и производные от e-mail.
 */
const COMMON = [
  "password",
  "passw0rd",
  "qwerty",
  "qwerty123",
  "123456",
  "1234567",
  "12345678",
  "123456789",
  "1q2w3e4r",
  "iloveyou",
  "admin",
  "adminadmin",
  "welcome",
  "letmein",
  "zaq12wsx",
  "пароль",
  "йцукен",
];

/** @returns текст ошибки или null, если пароль достаточно стойкий. */
export function passwordIssue(password: string, email?: string): string | null {
  const p = password.trim();
  if (p.length < 8) return "Пароль — минимум 8 символов.";
  if (p.length > 72) return "Пароль слишком длинный: максимум 72 символа.";
  if (!/[A-ZА-ЯЁ]/.test(p)) return "Добавьте хотя бы одну заглавную букву.";
  if (!/[a-zа-яё]/.test(p)) return "Добавьте хотя бы одну строчную букву.";
  if (!/\d/.test(p)) return "Добавьте хотя бы одну цифру.";
  if (!/[^A-Za-zА-Яа-яЁё0-9]/.test(p)) return "Добавьте спецсимвол (например, ! @ # $ %).";

  const lower = p.toLowerCase();
  if (COMMON.some((c) => lower === c || lower.startsWith(c))) {
    return "Этот пароль есть в словарях утечек. Придумайте другой.";
  }
  if (/^(.)\1+$/.test(p)) return "Пароль из одного повторяющегося символа недопустим.";
  if (/0123|1234|2345|3456|4567|5678|6789|abcd|qwer/.test(lower)) {
    return "Уберите последовательности вида 1234 / qwer.";
  }
  const local = email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) {
    return "Пароль не должен повторять ваш e-mail.";
  }
  return null;
}

/** 0..4 — для индикатора надёжности. */
export function passwordScore(password: string): number {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-ZА-ЯЁ]/.test(password) && /[a-zа-яё]/.test(password)) score++;
  if (/\d/.test(password) && /[^A-Za-zА-Яа-яЁё0-9]/.test(password)) score++;
  return Math.min(4, score);
}
