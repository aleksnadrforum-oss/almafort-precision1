import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit.server";
import { readJson, SlowRequestError, timeoutResponse } from "@/lib/request-guard.server";

// Ограничение длины — защита от «token exhaustion»: длинный мусор
// не должен оплачиваться токенами LLM.
const schema = z.object({
  query: z.string().trim().min(3).max(1000),
  // Контекст предыдущего шага диалога: артикулы и количества.
  history: z
    .object({
      query: z.string().max(1000),
      items: z
        .array(z.object({ sku: z.string().max(32), quantity: z.number().int().min(1).max(10_000_000) }))
        .max(20),
    })
    .nullish(),
});

export const Route = createFileRoute("/api/configurator/solve")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Дорогой LLM-эндпоинт: не чаще 10 расчётов в минуту с одного IP.
        const limited = rateLimit(request, "configurator", {
          limit: 3,
          windowMs: 60_000,
          blockMs: 10 * 60_000,
        });
        if (limited) return limited;

        let input: z.infer<typeof schema>;
        try {
          input = schema.parse(await readJson(request));
        } catch (e) {
          if (e instanceof SlowRequestError) return timeoutResponse();
          return Response.json(
            {
              error:
                "Опишите задачу подробнее (до 1000 символов): объект, масса, основание.",
            },
            { status: 400 },
          );
        }
        try {
          const { solveConfiguration } = await import("@/lib/rag.server");
          const result = await solveConfiguration(input.query, input.history ?? null);
          return Response.json(result);
        } catch (e) {
          const message = e instanceof Error ? e.message : "Ошибка конфигуратора";
          console.error("[configurator]", message);
          // Клиенту — вежливая деградация с переходом на живого инженера.
          return Response.json({ error: message, fallback: true }, { status: 503 });
        }
      },
    },
  },
});
