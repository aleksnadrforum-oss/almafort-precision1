/**
 * Сессионная кука ALMAFORT: HttpOnly и Secure на HTTPS.
 *
 * HTTPS-предпросмотр Lovable работает внутри iframe другого сайта, поэтому
 * SameSite=Strict заставляет браузер молча отбросить cookie после успешного
 * ввода OTP. На HTTPS используем SameSite=None + Secure; на локальном HTTP —
 * SameSite=Lax, поскольку None без Secure браузеры не принимают.
 * Токен НИКОГДА не попадает в localStorage — только в куку, недоступную JS.
 */
export const SESSION_COOKIE = "almafort_session";

function isHttps(request: Request) {
  try {
    return (
      new URL(request.url).protocol === "https:" ||
      request.headers.get("x-forwarded-proto") === "https"
    );
  } catch {
    return false;
  }
}

export function sessionCookie(request: Request, token: string, expiresAtSec: number): string {
  const maxAge = Math.max(60, expiresAtSec - Math.floor(Date.now() / 1000));
  const secure = isHttps(request);
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    secure ? "SameSite=None" : "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  // Secure нельзя ставить на http — иначе браузер молча выбросит куку
  // (self-host по IP до выпуска сертификата).
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie(request: Request): string {
  const secure = isHttps(request);
  const parts = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    secure ? "SameSite=None" : "SameSite=Lax",
    "Max-Age=0",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/** Достаёт токен из заголовка Cookie входящего запроса. */
export function readSessionCookie(request: Request | undefined | null): string | null {
  const raw = request?.headers?.get("cookie");
  if (!raw) return null;
  for (const chunk of raw.split(";")) {
    const [name, ...rest] = chunk.trim().split("=");
    if (name === SESSION_COOKIE) return rest.join("=") || null;
  }
  return null;
}
