// Невидимая Google reCAPTCHA v3: ленивая загрузка скрипта и выдача токена по клику.

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, opts: { action: string }) => Promise<string>;
    };
  }
}

const SITE_KEY = import.meta.env['VITE_RECAPTCHA_SITE_KEY'] as string | undefined;

let loader: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (!SITE_KEY) return Promise.reject(new Error("no site key"));
  if (loader) return loader;
  loader = new Promise<void>((resolve, reject) => {
    if (window.grecaptcha) return resolve();
    const s = document.createElement("script");
    s.src = `https://www.google.com/recaptcha/api.js?render=${SITE_KEY}`;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("recaptcha load failed"));
    document.head.appendChild(s);
  });
  return loader;
}

/** Возвращает токен или undefined, если капча не настроена/недоступна. */
export async function getRecaptchaToken(action = "quiz_submit"): Promise<string | undefined> {
  if (!SITE_KEY) return undefined;
  try {
    await loadScript();
    const g = window.grecaptcha;
    if (!g) return undefined;
    await new Promise<void>((r) => g.ready(() => r()));
    return await g.execute(SITE_KEY, { action });
  } catch {
    return undefined;
  }
}
