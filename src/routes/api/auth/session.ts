/**
 * Лёгкая проверка сессии: всегда 200, чтобы клиент не ловил 401-ошибки
 * при устаревшем снимке профиля в localStorage.
 */
import { createFileRoute } from "@tanstack/react-router";
import { readSessionCookie } from "@/lib/session-cookie.server";

export const Route = createFileRoute("/api/auth/session")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const raw = readSessionCookie(request) ?? "";
        const headers = { "Cache-Control": "no-store, private" };
        if (raw.split(".").length !== 3) return Response.json({ authed: false }, { headers });
        try {
          const { verifyToken } = await import("@/lib/auth.server");
          return Response.json({ authed: Boolean(verifyToken(raw)) }, { headers });
        } catch {
          return Response.json({ authed: false }, { headers });
        }
      },
    },
  },
});
