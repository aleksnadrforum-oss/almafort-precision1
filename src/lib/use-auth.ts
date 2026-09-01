/**
 * Единая точка правды об авторизации для навигации (шапка, подвал, мобильный бар).
 *
 * localStorage — лишь снимок профиля; настоящая сессия живёт в HttpOnly-куке,
 * поэтому статус подтверждается запросом `/api/auth/session`. Результат
 * кэшируется на уровне модуля, чтобы все компоненты делали один общий запрос.
 */
import { useCallback, useEffect, useState } from "react";
import {
  currentUser,
  getServerSession,
  onAuthChange,
  type ServerSession,
  type SessionUser,
} from "@/lib/session";

let cache: ServerSession | null = null;
let inflight: Promise<ServerSession> | null = null;

/** Проверка сессии с дедупликацией параллельных вызовов. */
export function ensureServerSession(force = false): Promise<ServerSession> {
  if (!force && cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = getServerSession()
      .then((session) => {
        if (session.checked) cache = session;
        return session;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function invalidateSessionCache() {
  cache = null;
}

export type AuthStatus = {
  user: SessionUser | null;
  isAuthenticated: boolean;
  /** false, пока сервер не подтвердил сессию. */
  checked: boolean;
  /** Куда вести пользователя из точек входа «Кабинет снабженца». */
  cabinetHref: "/cabinet" | "/auth";
  /** Сохранить вход (после подтверждения кода) и обновить навигацию. */
  login: (user: SessionUser, expiresAt: number) => void;
  /** Выход: гасим куку на сервере и локальный снимок профиля. */
  logout: () => void;
  /**
   * Единый обработчик для «Кабинет снабженца» / «Вход для партнёров» /
   * «Профиль»: авторизованного ведём сразу в кабинет, остальных — на вход.
   */
  goToCabinet: (event?: { preventDefault: () => void }) => void;
};

export function useAuth(): AuthStatus {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checked, setChecked] = useState(false);

  const refresh = useCallback((force = false) => {
    // Мгновенно показываем снимок из localStorage, затем уточняем по кукe.
    const snapshot = currentUser();
    if (snapshot) setUser(snapshot);
    void ensureServerSession(force).then((session) => {
      if (session.checked) {
        setUser(session.authed && session.user ? session.user : null);
        setChecked(true);
      } else if (snapshot) {
        // Сеть недоступна — доверяем локальному снимку, чтобы не выкидывать на вход.
        setChecked(true);
      }
    });
  }, []);

  useEffect(() => {
    refresh();
    return onAuthChange(() => refresh(true));
  }, [refresh]);

  const login = useCallback((nextUser: SessionUser, expiresAt: number) => {
    invalidateSessionCache();
    writeSession({ user: nextUser, expiresAt });
    setUser(nextUser);
    setChecked(true);
  }, []);

  const logout = useCallback(() => {
    invalidateSessionCache();
    clearSession();
    setUser(null);
    setChecked(true);
  }, []);

  const goToCabinet = useCallback(
    (event?: { preventDefault: () => void }) => {
      event?.preventDefault();
      window.location.href = user ? "/cabinet" : "/auth";
    },
    [user],
  );

  return {
    user,
    isAuthenticated: Boolean(user),
    checked,
    cabinetHref: user ? "/cabinet" : "/auth",
    login,
    logout,
    goToCabinet,
  };
}

