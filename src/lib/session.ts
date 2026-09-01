/**
 * Клиентская сессия ALMAFORT.
 *
 * ВАЖНО: сам токен авторизации в браузерном хранилище НЕ живёт — он лежит
 * в HttpOnly-куке `almafort_session`, недоступной JavaScript. В localStorage
 * держим только безопасный снимок профиля, чтобы шапка и кабинет знали,
 * кто вошёл, без лишних запросов.
 */
export type SessionUser = {
  id: string;
  email: string;
  full_name: string | null;
  email_verified: boolean;
};

export type Session = { user: SessionUser; expiresAt: number; token?: string };

export type ServerSession = {
  authed: boolean;
  checked: boolean;
  user?: SessionUser;
  expiresAt?: number;
};

const KEY = "almafort:session:v2";
const EVENT = "almafort:auth";

export function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed?.user?.id || parsed.expiresAt * 1000 < Date.now()) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeSession(session: Session) {
  if (typeof window === "undefined") return;
  // Токен намеренно отбрасываем: хранить его в localStorage запрещено.
  const safe: Session = { user: session.user, expiresAt: session.expiresAt };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(safe));
    window.dispatchEvent(new CustomEvent(EVENT, { detail: "SIGNED_IN" }));
  } catch {
    // Safari может запретить localStorage (приватный режим/ограничения
    // хранилища). Это лишь UI-снимок: настоящая сессия уже лежит в HttpOnly-cookie.
  }
}

export function clearSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
  // Куку может погасить только сервер.
  void fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => {});
  window.dispatchEvent(new CustomEvent(EVENT, { detail: "SIGNED_OUT" }));
}

export const currentUser = () => readSession()?.user ?? null;
export const isAuthed = () => Boolean(readSession());
/** Токен недоступен клиенту — сессия передаётся кукой. */
export const authToken = (): string | null => null;

/** Проверяет настоящую HttpOnly-сессию, не полагаясь на localStorage. */
export async function getServerSession(timeoutMs = 12_000): Promise<ServerSession> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("/api/auth/session", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return { authed: false, checked: true };
    const session = (await response.json()) as ServerSession;
    if (session.authed && session.user && session.expiresAt) {
      writeSession({ user: session.user, expiresAt: session.expiresAt });
    }
    return { ...session, checked: true };
  } catch {
    // Сетевой сбой не равен выходу: не уничтожаем рабочую cookie из-за
    // кратковременного обрыва мобильной сети.
    return { authed: false, checked: false };
  } finally {
    window.clearTimeout(timer);
  }
}

/** Подписка на вход/выход, в том числе из соседней вкладки. */
export function onAuthChange(handler: (event: "SIGNED_IN" | "SIGNED_OUT") => void) {
  if (typeof window === "undefined") return () => {};
  const local = (e: Event) => handler((e as CustomEvent<string>).detail as "SIGNED_IN");
  const cross = (e: StorageEvent) => {
    if (e.key === KEY) handler(e.newValue ? "SIGNED_IN" : "SIGNED_OUT");
  };
  window.addEventListener(EVENT, local);
  window.addEventListener("storage", cross);
  return () => {
    window.removeEventListener(EVENT, local);
    window.removeEventListener("storage", cross);
  };
}
