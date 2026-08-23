/**
 * Единая точка нормализации URL картинок.
 *
 * Исторически часть медиа лежала на CDN Lovable по путям вида
 * `/__l5e/assets-v1/<uuid>/<file>`. Такие пути раздаёт только инфраструктура
 * Lovable, поэтому на собственном VPS (Nitro node-server) они отдают 404.
 *
 * Все файлы продублированы в `public/media/<file>` и раздаются самим сервером,
 * так что достаточно переписать путь на локальный.
 */
export function mediaUrl(src: string): string;
export function mediaUrl(src?: string | null): string | undefined;
export function mediaUrl(src?: string | null): string | undefined {
  if (!src) return undefined;
  if (src.startsWith("/__l5e/")) {
    const file = src.split("/").pop();
    return file ? `/media/${file}` : src;
  }
  return src;
}
