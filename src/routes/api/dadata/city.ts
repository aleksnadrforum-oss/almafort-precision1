import { createFileRoute } from "@tanstack/react-router";
import { rateLimit } from "@/lib/rate-limit.server";
import { searchCities } from "@/data/cities";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

/**
 * Подсказки городов. При наличии токена DaData нормализуем адрес через неё
 * (точные ФИАС/КЛАДР коды), иначе отдаём локальный справочник.
 */
export const Route = createFileRoute("/api/dadata/city")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const limited = rateLimit(request, "city", { limit: 90, windowMs: 60_000 });
        if (limited) return limited;
        let query = "";
        try {
          const body = (await request.json()) as { query?: unknown };
          query = typeof body.query === "string" ? body.query.trim().slice(0, 80) : "";
        } catch {
          return json({ error: "Некорректный запрос" }, 400);
        }
        if (query.length < 2) return json({ suggestions: [] });

        const { secretValue } = await import("@/lib/vault.server");
        const token = await secretValue("DADATA_API_KEY");
        if (token) {
          try {
            const res = await fetch(
              "https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Accept: "application/json",
                  Authorization: `Token ${token}`,
                },
                body: JSON.stringify({ query, count: 7, from_bound: { value: "city" }, to_bound: { value: "settlement" } }),
              },
            );
            if (res.ok) {
              const data = (await res.json()) as {
                suggestions: Array<{
                  data: { city?: string; settlement?: string; region_with_type?: string; city_fias_id?: string; settlement_fias_id?: string; fias_id?: string };
                }>;
              };
              const suggestions = data.suggestions
                .map((s) => ({
                  city: s.data.city ?? s.data.settlement ?? "",
                  region: s.data.region_with_type ?? "",
                  fiasId: s.data.city_fias_id ?? s.data.settlement_fias_id ?? s.data.fias_id ?? null,
                }))
                .filter((s) => s.city);
              return json({ suggestions, source: "dadata" });
            }
          } catch {
            /* падаем в локальный справочник */
          }
        }

        return json({ suggestions: searchCities(query), source: "local" });
      },
    },
  },
});
