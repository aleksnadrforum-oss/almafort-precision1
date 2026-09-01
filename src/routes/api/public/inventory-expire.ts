import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { expireStaleHolds } from "@/lib/inventory.server";

/**
 * Фоновая задача TTL: снимает просроченные резервы и возвращает товар
 * в пул availableStock. Вызывается планировщиком по Bearer-секрету.
 */
export const Route = createFileRoute("/api/public/inventory-expire")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const released = await expireStaleHolds();
        return Response.json({ ok: true, released });
      },
    },
  },
});
