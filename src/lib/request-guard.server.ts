/**
 * Защита от «медленных» клиентов (Slowloris) на уровне приложения.
 * Ботнет открывает соединение с формой и отдаёт тело по байту в секунду,
 * удерживая воркер. Мы не ждём: чтение тела ограничено таймаутом,
 * после которого соединение бросается с 408.
 */
export const BODY_TIMEOUT_MS = 8_000;
export const UPLOAD_BODY_TIMEOUT_MS = 20_000;

export class SlowRequestError extends Error {
  constructor() {
    super("Slow request body");
    this.name = "SlowRequestError";
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new SlowRequestError()), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e as Error);
      },
    );
  });
}

export const timeoutResponse = () =>
  Response.json(
    { error: "Запрос передавался слишком медленно. Повторите отправку." },
    { status: 408, headers: { Connection: "close" } },
  );

/** Читает JSON-тело не дольше ms; иначе бросает SlowRequestError. */
export function readJson(request: Request, ms = BODY_TIMEOUT_MS): Promise<unknown> {
  return withTimeout(request.json(), ms);
}

/** Читает multipart-тело не дольше ms (загрузка файлов — больший бюджет). */
export function readFormData(request: Request, ms = UPLOAD_BODY_TIMEOUT_MS): Promise<FormData> {
  return withTimeout(request.formData(), ms);
}
