import { createFileRoute } from "@tanstack/react-router";
import { rateLimit } from "@/lib/rate-limit.server";
import { sanitizeParcel } from "@/lib/logistics";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const Route = createFileRoute("/api/shipping-calc")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const limited = rateLimit(request, "ship", { limit: 60, windowMs: 60_000 });
        if (limited) return limited;
        let body: {
          destination?: { city?: unknown; fias_id?: unknown };
          parcel?: { totalWeight?: unknown; totalVolume?: unknown };
        };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return json({ error: "Некорректный запрос" }, 400);
        }

        const city =
          typeof body.destination?.city === "string"
            ? body.destination.city.trim().slice(0, 120)
            : "";
        const fiasId =
          typeof body.destination?.fias_id === "string"
            ? body.destination.fias_id.slice(0, 64)
            : null;
        if (city.length < 2) return json({ error: "Укажите город доставки" }, 400);

        const parcel = sanitizeParcel({
          totalWeight: Number(body.parcel?.totalWeight),
          totalVolume: Number(body.parcel?.totalVolume),
        });

        const { calcShipping } = await import("@/lib/shipping.server");
        const quotes = await calcShipping({ city, fiasId }, parcel);
        if (!quotes.length) return json({ error: "Транспортные компании недоступны" }, 503);

        return json({ destination: { city, fias_id: fiasId }, parcel, quotes });
      },
    },
  },
});
