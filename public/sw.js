/**
 * Kill-switch service worker.
 *
 * Старые версии воркера кешировали HTML-навигации и ломали переходы
 * (`ERR_INVALID_RESPONSE` на /catalog в Safari и Chrome). Этот файл
 * ничего не кеширует: он сносит все кеши и снимает собственную
 * регистрацию у всех уже «заражённых» клиентов.
 */
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) client.navigate(client.url);
    })(),
  );
});
