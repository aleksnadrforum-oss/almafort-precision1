import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const schema = z.object({
  // data:image/webp;base64,... — кадр из камеры, обрезанный по рамке и ужатый до 1024px
  image: z
    .string()
    .min(64)
    .max(4_000_000)
    .refine((v) => v.startsWith("data:image/"), "Ожидается data:image/*"),
});

export const Route = createFileRoute("/api/vision/identify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let raw: string;
        try {
          raw = schema.parse(await request.json()).image;
        } catch {
          return Response.json({ error: "Некорректный кадр" }, { status: 400 });
        }
        try {
          // Защита от спуфинга: расширению и MIME не верим — проверяем сигнатуру
          // и пересобираем картинку без EXIF/XMP/ICC, только потом отдаём модели.
          const { sanitizeImageDataUrl } = await import("@/lib/image-sanitize.server");
          const clean = sanitizeImageDataUrl(raw);
          if (!clean) {
            return Response.json(
              { error: "Файл не является корректным изображением JPG, PNG или WebP" },
              { status: 400 },
            );
          }
          const image = clean.dataUrl;

          const {
            identifyPart,
            matchProducts,
            classVariants,
            candidateCategories,
            logVisionFail,
            verdictCategory,
          } = await import("@/lib/vision.server");
          const verdict = await identifyPart(image);

          const brief = (p: {
            sku: string;
            name: string;
            dims: string;
            price: number;
            stock: { qty: number; lead?: string };
          }) => ({
            sku: p.sku,
            name: p.name,
            dims: p.dims,
            price: p.price,
            stock: p.stock.qty,
            lead: p.stock.lead ?? null,
          });

          // Маршрутизация по Confidence Score (Блок 3 ТЗ).
          const score = verdict.confidence;
          const category = verdictCategory(verdict);

          // Плохие условия съёмки важнее вердикта: гадать по пикселям запрещено.
          if (verdict.low_light && verdict.status !== "FOREIGN") {
            void logVisionFail(image, verdict);
            return Response.json({ scenario: "lowlight", verdict });
          }

          if (verdict.status === "INVALID" || score < 0.1) {
            void logVisionFail(image, verdict);
            return Response.json({ scenario: "invalid", verdict });
          }

          if (verdict.status === "VALID" && score < 0.4) {
            void logVisionFail(image, verdict);
            return Response.json({ scenario: "lowlight", verdict });
          }

          if (verdict.status === "FOREIGN" || score < 0.5 || !category) {
            void logVisionFail(image, verdict);
            return Response.json({ scenario: "foreign", verdict });
          }

          if (score >= 0.85) {
            // Масштаб по фото не определяется: отдаём класс и весь размерный ряд.
            return Response.json({
              scenario: "exact",
              verdict,
              category,
              variants: classVariants(verdict).map(brief),
            });
          }

          if (score >= 0.75) {
            const matches = matchProducts(verdict, 3).map(brief);
            const reinforced = matches.some((m) => /металл|усиленн/i.test(m.name));
            return Response.json({
              scenario: "ambiguous",
              verdict,
              question: reinforced
                ? "Вам требуется цельнопластиковый вариант или усиленный металлическим каркасом?"
                : `Найдено ${matches.length} похожих варианта. Уточните, какой именно нужен:`,
              matches,
            });
          }

          // < 0.75 — ложный артикул выдавать запрещено: спрашиваем человека.
          void logVisionFail(image, verdict);
          return Response.json({
            scenario: "clarify",
            verdict,
            question:
              "Деталь распознана неточно. Уточните категорию — артикул подберём после вашего выбора:",
            groups: candidateCategories(verdict, 3).map((g) => ({
              category: g.category,
              items: g.items.map(brief),
            })),
          });

        } catch (e) {
          const message = e instanceof Error ? e.message : "Ошибка распознавания";
          console.error("[vision]", message);
          // Ключи ИИ не заданы или шлюз недоступен — камера уходит в ручной режим.
          const unavailable = (e as { fallback?: boolean })?.fallback === true;
          return Response.json(
            {
              error: unavailable
                ? "Сервис временно недоступен. Найдите деталь в каталоге вручную или отправьте фото менеджеру."
                : message,
              fallback: unavailable,
            },
            { status: unavailable ? 503 : 502 },
          );
        }

      },
    },
  },
});
