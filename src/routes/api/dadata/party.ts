import { createFileRoute } from "@tanstack/react-router";
import { rateLimit } from "@/lib/rate-limit.server";
import { z } from "zod";

const schema = z.object({
  inn: z
    .string()
    .trim()
    .regex(/^\d{10}(\d{2})?$/, "ИНН должен содержать 10 или 12 цифр"),
});

/**
 * Обогащение реквизитов по ИНН (DaData findById).
 * Одна точка для корзины, кабинета и админки — правила валидации не расходятся.
 */
export const Route = createFileRoute("/api/dadata/party")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const limited = rateLimit(request, "party", { limit: 30, windowMs: 60_000 });
        if (limited) return limited;
        let inn: string;
        try {
          inn = schema.parse(await request.json()).inn;
        } catch {
          return Response.json(
            { error: "Некорректный формат. ИНН должен содержать 10 или 12 цифр" },
            { status: 400 },
          );
        }
        try {
          const { findPartyByInn } = await import("@/lib/dadata.server");
          const party = await findPartyByInn(inn);
          return Response.json({
            party,
            blockedReason: party.blocked
              ? "Данное юридическое лицо ликвидировано или находится в стадии банкротства. Выставление счёта невозможно"
              : null,
          });
        } catch (e) {
          console.error("[dadata/party]", e);
          return Response.json({ error: "Сервис проверки ИНН недоступен" }, { status: 502 });
        }
      },
    },
  },
});
