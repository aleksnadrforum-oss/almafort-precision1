import { createFileRoute } from "@tanstack/react-router";

/**
 * Крон-эндпоинт Retry Pattern: раз в 15 минут добивает заказы,
 * которые не ушли в 1С (профилактика сервера, обрыв связи).
 * Защита — общий токен вебхуков 1С в заголовке X-Almafort-Erp-Token.
 */
export const Route = createFileRoute("/api/public/erp/retry")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { secretValue } = await import("@/lib/vault.server");
        const token = await secretValue("ERP_1C_TOKEN");
        if (!token || request.headers.get("X-Almafort-Erp-Token") !== token) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { retryPendingOrders } = await import("@/lib/erp-1c.server");
        const { retryPendingCrmLeads } = await import("@/lib/crm-queue.server");
        const result = await retryPendingOrders();
        const crm = await retryPendingCrmLeads().catch((e) => ({
          processed: 0,
          sent: 0,
          error: String(e),
        }));
        return Response.json({ ok: true, ...result, crm });
      },
    },
  },
});
