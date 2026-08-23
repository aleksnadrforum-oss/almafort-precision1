/**
 * Перехватчик и словарь ошибок авторизации: клиент никогда не видит сырой
 * ответ сервера — только русский B2B-текст с инструкцией к действию.
 */

const DICTIONARY: Record<string, string> = {
  "auth/weak-password":
    "Пароль слишком простой. Используйте минимум 8 символов, заглавные буквы и цифры.",
  "auth/email-already-in-use":
    "Этот E-mail уже зарегистрирован. Воспользуйтесь восстановлением пароля.",
  "auth/wrong-password": "Неверный E-mail или пароль.",
  "auth/user-not-found": "Пользователь с таким E-mail не найден.",
  "auth/email-not-verified":
    "Почта не подтверждена. Откройте ссылку из письма ALMAFORT — после этого вход разблокируется.",
  "auth/too-many-requests":
    "Слишком много попыток входа. Система временно заблокирована в целях безопасности. Повторите попытку через 15 минут.",
  "auth/invalid-email": "Укажите корректный рабочий E-mail.",
  "auth/same-password": "Новый пароль совпадает со старым. Придумайте другой.",
  "auth/expired-link":
    "Ссылка устарела или уже использована. Запросите новое письмо для входа или сброса пароля.",
  "network-error": "Ошибка соединения с сервером. Проверьте интернет-подключение.",
  default: "Произошла системная ошибка. Инженерный отдел уже уведомлен.",
};

/** Приводит ответ провайдера авторизации к внутреннему коду словаря. */
export function authErrorCode(error: unknown): string {
  const raw =
    typeof error === "string"
      ? error
      : ((error as { message?: string } | null)?.message ?? "");
  const status = (error as { status?: number } | null)?.status;
  const m = raw.toLowerCase();

  if (!raw && status === undefined) return "default";
  if (status === 429 || /rate limit|too many/.test(m)) return "auth/too-many-requests";
  if (/failed to fetch|networkerror|network request failed/.test(m)) return "network-error";
  if (/email not confirmed|email_not_confirmed/.test(m)) return "auth/email-not-verified";
  if (/already registered|already been registered|user already exists/.test(m))
    return "auth/email-already-in-use";
  if (/invalid login credentials|invalid credentials/.test(m)) return "auth/wrong-password";
  if (/user not found/.test(m)) return "auth/user-not-found";
  if (/password should be|weak password|at least 6|at least 8/.test(m)) return "auth/weak-password";
  if (/should be different from the old password|same.*password/.test(m))
    return "auth/same-password";
  if (/invalid email|unable to validate email/.test(m)) return "auth/invalid-email";
  if (/expired|invalid token|otp_expired/.test(m)) return "auth/expired-link";
  return "default";
}

/** Готовый русский текст ошибки для Toast или подписи под инпутом. */
export function authErrorMessage(error: unknown): string {
  const code = authErrorCode(error);
  return DICTIONARY[code] ?? DICTIONARY["default"]!;
}

/** Поле формы, под которым логично показать эту ошибку. */
export function authErrorField(error: unknown): "email" | "password" | null {
  const code = authErrorCode(error);
  if (code === "auth/weak-password" || code === "auth/same-password") return "password";
  if (code === "auth/wrong-password") return "password";
  if (
    code === "auth/email-already-in-use" ||
    code === "auth/user-not-found" ||
    code === "auth/invalid-email" ||
    code === "auth/email-not-verified"
  )
    return "email";
  return null;
}
