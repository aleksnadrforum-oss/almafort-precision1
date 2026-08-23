import { SITE_URL } from "@/lib/seo";

/**
 * Уведомление поисковых систем о переобходе sitemap.
 * Вызывается после обновления каталога/услуг. Ошибки не критичны — логируем и идём дальше.
 */
const TARGETS = (sitemap: string) => [
  `https://webmaster.yandex.ru/ping?sitemap=${encodeURIComponent(sitemap)}`,
  `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemap)}`,
];

let lastPing = 0;
const MIN_INTERVAL_MS = 5 * 60_000;

export async function pingSearchEngines(
  sitemap = `${SITE_URL}/sitemap.xml`,
): Promise<{ pinged: boolean; results: Array<{ url: string; ok: boolean }> }> {
  const now = Date.now();
  if (now - lastPing < MIN_INTERVAL_MS) return { pinged: false, results: [] };
  lastPing = now;

  const results = await Promise.all(
    TARGETS(sitemap).map(async (url) => {
      try {
        const res = await fetch(url, { method: "GET" });
        return { url, ok: res.ok };
      } catch {
        return { url, ok: false };
      }
    }),
  );
  return { pinged: true, results };
}
