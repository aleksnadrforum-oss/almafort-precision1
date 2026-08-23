import { createFileRoute } from "@tanstack/react-router";
import { clientIp, rateLimit } from "@/lib/rate-limit.server";
import { readFormData, SlowRequestError, timeoutResponse } from "@/lib/request-guard.server";

const MAX_BYTES = 10 * 1024 * 1024;
const BAD_FORMAT = "Ошибка: Файл поврежден или имеет неверный формат. Загрузите корректный документ Excel";

export const Route = createFileRoute("/api/parser/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Тяжёлая операция: 3 загрузки в минуту с IP, далее бан на 10 минут.
        const limited = rateLimit(request, "spec-upload", {
          limit: 3,
          windowMs: 60_000,
          blockMs: 10 * 60_000,
        });
        if (limited) return limited;
        try {
          const form = await readFormData(request);
          const file = form.get("file");
          if (!(file instanceof File)) {
            return Response.json({ error: "Файл не получен" }, { status: 400 });
          }
          if (file.size > MAX_BYTES) {
            return Response.json(
              {
                error:
                  "Файл слишком велик. Максимальный размер — 10 МБ (до 5000 позиций). Разделите смету на две части",
              },
              { status: 413 },
            );
          }
          const ext = file.name.toLowerCase().split(".").pop() ?? "";
          if (!["xls", "xlsx", "xlsm", "csv"].includes(ext)) {
            return Response.json({ error: BAD_FORMAT }, { status: 415 });
          }

          const bytes = new Uint8Array(await file.arrayBuffer());
          if (bytes.byteLength === 0) return Response.json({ error: BAD_FORMAT }, { status: 415 });

          const { sniffSpec, decodeText, parseSpecBuffer, parseSpecText } = await import(
            "@/lib/spec-parser.server"
          );
          // Реальная сигнатура важнее расширения: renamed .exe/.php/.jpg отсекаются здесь.
          const sniff = sniffSpec(bytes, file.name);
          if (!sniff.ok) return Response.json({ error: BAD_FORMAT }, { status: 415 });
          if (ext === "csv" && sniff.kind !== "text") {
            return Response.json({ error: BAD_FORMAT }, { status: 415 });
          }
          if (ext !== "csv" && sniff.kind === "text") {
            return Response.json({ error: BAD_FORMAT }, { status: 415 });
          }

          if (sniff.kind === "zip") {
            // Zip bomb / XXE / VBA — проверяем контейнер до парсинга.
            const { inspectOoxml } = await import("@/lib/zip-guard.server");
            const verdict = await inspectOoxml(bytes);
            if (!verdict.ok) {
              console.warn(`[spec-upload] ${verdict.reason} from ${clientIp(request)}: ${verdict.detail}`);
              if (verdict.reason === "bomb") {
                return Response.json(
                  { error: "Файл распаковывается в слишком большой объём данных. Разделите смету на части" },
                  { status: 413 },
                );
              }
              return Response.json({ error: BAD_FORMAT }, { status: 415 });
            }
          }

          let result;
          try {
            result =
              sniff.kind === "text"
                ? parseSpecText(decodeText(bytes))
                : parseSpecBuffer(bytes.buffer.slice(0) as ArrayBuffer);
          } catch {
            return Response.json({ error: BAD_FORMAT }, { status: 415 });
          }
          if (!result.rows.length) {
            return Response.json(
              { error: "В файле не найдено ни одной товарной строки. Проверьте таблицу" },
              { status: 422 },
            );
          }
          return Response.json({ fileName: file.name, ...result });
        } catch (e) {
          if (e instanceof SlowRequestError) return timeoutResponse();
          return Response.json({ error: BAD_FORMAT }, { status: 400 });
        }
      },
    },
  },
});
