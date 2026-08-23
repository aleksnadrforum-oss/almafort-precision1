import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X } from "lucide-react";
import { adminLinkAssetGroup } from "@/lib/admin.functions";

type Img = { thumb_url: string; full_url: string; caption?: string };

/**
 * Конвертация мастер-фото в webp: квадратный холст с белым фоном,
 * два размера — thumbnail 64×64 для таблицы и full 800×800 для модалки.
 */
async function toWebp(file: File): Promise<Img> {
  const bitmap = await createImageBitmap(file);
  const render = (size: number) => {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, size, size);
    const k = Math.min(size / bitmap.width, size / bitmap.height);
    const w = bitmap.width * k;
    const h = bitmap.height * k;
    ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);
    return canvas.toDataURL("image/webp", 0.88);
  };
  return { thumb_url: render(64), full_url: render(800), caption: file.name };
}

export function AssetLinkModal({
  skus,
  onClose,
}: {
  skus: string[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const link = useServerFn(adminLinkAssetGroup);
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<Img[]>([]);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      link({ data: { slug: slug.trim(), title: title.trim(), description, images, skus } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["asset-groups"] });
      qc.invalidateQueries({ queryKey: ["admin-asset-groups"] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const valid = slug.trim().length >= 2 && title.trim().length >= 2;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-xl bg-background p-6 shadow-xl">
        <div className="mb-4 flex items-start gap-4">
          <div className="flex-1">
            <h2 className="text-lg font-bold">Привязать контент</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Артикулов выбрано: {skus.length} — {skus.join(", ")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="grid size-8 cursor-pointer place-items-center rounded-md transition-all hover:scale-105 hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="text-xs uppercase text-muted-foreground">Код группы (slug)</span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="ZGV-Square-Small"
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 focus:border-[#DC2626] focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase text-muted-foreground">Название группы</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Заглушки внутренние квадратные 15–25 мм"
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 focus:border-[#DC2626] focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase text-muted-foreground">
              Техническое описание
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder="Назначение и монтаж: ..."
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 leading-[1.6] focus:border-[#DC2626] focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-xs uppercase text-muted-foreground">
              Мастер-фото (1 — вид сверху, 2 — инженерный ракурс)
            </span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="mt-1 w-full cursor-pointer rounded-md border bg-background px-3 py-2"
              onChange={async (e) => {
                const files = Array.from(e.target.files ?? []).slice(0, 8);
                if (files.length) setImages(await Promise.all(files.map(toWebp)));
                e.target.value = "";
              }}
            />
          </label>

          {images.length > 0 && (
            <div className="flex gap-2">
              {images.map((img, i) => (
                <img
                  key={i}
                  src={img.full_url}
                  alt=""
                  className="size-16 rounded-md border bg-white object-contain"
                />
              ))}
            </div>
          )}

          {error && <p className="text-sm text-[#DC2626]">{error}</p>}

          <button
            type="button"
            disabled={!valid || mutation.isPending}
            onClick={() => mutation.mutate()}
            className="w-full rounded-md bg-[#DC2626] px-4 py-2 font-medium text-white shadow-sm transition-all hover:bg-[#B91C1C] hover:shadow-md active:scale-[0.98] disabled:opacity-40"
          >
            {mutation.isPending ? "Сохраняем..." : `Привязать к ${skus.length} артикулам`}
          </button>
        </div>
      </div>
    </div>
  );
}
