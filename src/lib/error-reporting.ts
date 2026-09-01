/**
 * Клиентский репортер ошибок ALMAFORT.
 *
 * Не тянет внешних SDK и не ходит в сеть: если на странице есть внешний
 * коллектор (`window.__appErrorReporter`), ошибка уходит туда, иначе просто
 * пишется в консоль. Подключить Sentry/собственный /api/log можно одной
 * строкой внутри `reportClientError`.
 */
type ReporterPayload = {
  message: string;
  stack?: string;
  route: string;
  context: Record<string, unknown>;
};

declare global {
  interface Window {
    __appErrorReporter?: (payload: ReporterPayload) => void;
  }
}

export function reportClientError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;

  // Загрузчики и server functions умеют бросать сырой Response — String(it)
  // даёт бесполезное "[object Response]", поэтому разбираем статус и URL.
  const message =
    error instanceof Response
      ? `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`
      : error instanceof Error
        ? error.message
        : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  const payload: ReporterPayload = {
    message,
    ...(stack !== undefined && { stack }),
    route: window.location.pathname,
    context,
  };

  if (typeof window.__appErrorReporter === "function") {
    window.__appErrorReporter(payload);
    return;
  }
  console.error("[app-error]", payload.message, payload.context);
}
