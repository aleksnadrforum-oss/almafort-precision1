import { createFileRoute } from "@tanstack/react-router";
import { presignUpload } from "@/lib/s3-presign.server";

export const Route = createFileRoute("/api/upload/presigned-url")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const filename = (url.searchParams.get("filename") ?? "").slice(0, 200);
        const filetype = (url.searchParams.get("filetype") ?? "").slice(0, 120);
        if (!filename) {
          return Response.json({ error: "filename обязателен" }, { status: 400 });
        }
        const result = await presignUpload(filename, filetype);
        if (!result.ok) {
          // Хранилище ещё не сконфигурировано — не роняем форму,
          // квиз продолжит работу без вложения.
          if (result.status === 503) {
            return Response.json(
              { storage: "unconfigured", error: result.error },
              { status: 200, headers: { "Cache-Control": "no-store" } },
            );
          }
          return Response.json({ error: result.error }, { status: result.status });
        }
        return Response.json(
          {
            uploadUrl: result.uploadUrl,
            fileUrl: result.fileUrl,
            key: result.key,
            expiresIn: result.expiresIn,
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
