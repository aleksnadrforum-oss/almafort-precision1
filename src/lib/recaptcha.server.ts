// Проверка Google reCAPTCHA v3 на сервере.
// Порог доверия: score >= 0.5 — человек, ниже — тихо отбрасываем заявку.

export const TRUST_THRESHOLD = 0.5;

export type CaptchaVerdict = {
  configured: boolean;
  score: number;
  trusted: boolean;
  detail?: string;
};

export async function verifyRecaptcha(token: string | undefined): Promise<CaptchaVerdict> {
  const secret = process.env["RECAPTCHA_SECRET_KEY"];
  if (!secret) {
    // Капча не подключена — не блокируем сбор лидов.
    return { configured: false, score: 1, trusted: true, detail: "reCAPTCHA не сконфигурирована" };
  }
  if (!token) return { configured: true, score: 0, trusted: false, detail: "Токен отсутствует" };

  try {
    const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`reCAPTCHA verify failed [${res.status}]: ${body}`);
      // Недоступность Google не должна терять живые заявки.
      return { configured: true, score: 1, trusted: true, detail: `Google ${res.status}` };
    }
    const json = (await res.json()) as {
      success?: boolean;
      score?: number;
      action?: string;
      "error-codes"?: string[];
    };
    const score = typeof json.score === "number" ? json.score : 0;
    return {
      configured: true,
      score,
      trusted: Boolean(json.success) && score >= TRUST_THRESHOLD,
      ...(json["error-codes"]?.length ? { detail: json["error-codes"].join(",") } : {}),
    };
  } catch (e) {
    console.error("reCAPTCHA verify error:", e);
    return { configured: true, score: 1, trusted: true, detail: "network error" };
  }
}
