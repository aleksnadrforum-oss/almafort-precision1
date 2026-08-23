// Прямая загрузка файла в S3 по pre-signed URL с прогрессом (XHR).

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const ALLOWED_EXT = ["step", "stp", "stl", "pdf", "dwg", "jpg", "jpeg", "png"];

export function validateFile(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXT.includes(ext)) {
    return `Формат .${ext || "?"} не поддерживается — допустимы STEP, STL, DWG, PDF, JPG`;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `Файл «${file.name}» больше 50 МБ (${(file.size / 1024 / 1024).toFixed(1)} МБ)`;
  }
  return null;
}

export async function uploadToS3(
  file: File,
  onProgress: (percent: number) => void,
): Promise<string> {
  const q = new URLSearchParams({
    filename: file.name,
    filetype: file.type || "application/octet-stream",
  });
  const res = await fetch(`/api/upload/presigned-url?${q}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Не удалось получить ссылку загрузки [${res.status}]`);
  }
  const payload = (await res.json()) as {
    uploadUrl?: string;
    fileUrl?: string;
    storage?: string;
  };
  if (payload.storage === "unconfigured" || !payload.uploadUrl) {
    // Файл остаётся у менеджера в переписке: помечаем как локальное вложение.
    onProgress(100);
    return `local://${file.name}`;
  }
  const { uploadUrl, fileUrl } = payload as { uploadUrl: string; fileUrl: string };

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Хранилище отклонило файл [${xhr.status}]`));
    xhr.onerror = () => reject(new Error("Обрыв соединения при загрузке"));
    xhr.send(file);
  });

  onProgress(100);
  return fileUrl;
}
