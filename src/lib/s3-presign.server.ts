import { secretValues } from "@/lib/vault.server";
// Генерация Pre-signed URL (AWS SigV4, query-подпись) для прямой загрузки
// файлов клиентом в Yandex Object Storage минуя наш сервер.

const enc = new TextEncoder();

async function hmac(key: ArrayBuffer | Uint8Array, data: string) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
}

function hex(buf: ArrayBuffer) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(data: string) {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(data)));
}

/** Разрешённые расширения (совпадают с клиентской валидацией). */
export const ALLOWED_EXT = ["step", "stp", "stl", "pdf", "dwg", "jpg", "jpeg", "png"] as const;
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** Транслит + очистка имени файла, чтобы ключ в бакете был ASCII-безопасным. */
function safeName(name: string) {
  const dot = name.lastIndexOf(".");
  const ext = (dot > -1 ? name.slice(dot + 1) : "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const base = (dot > -1 ? name.slice(0, dot) : name)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return { base: base || "file", ext };
}

export type PresignResult =
  | { ok: true; uploadUrl: string; fileUrl: string; key: string; expiresIn: number }
  | { ok: false; error: string; status: number };

/**
 * Возвращает одноразовую подписанную ссылку на PUT, живущую 5 минут.
 * Имя файла дополняется UUID — перезапись чужих файлов невозможна.
 */
export async function presignUpload(
  filename: string,
  filetype: string,
): Promise<PresignResult> {
  const { base, ext } = safeName(filename);
  if (!ALLOWED_EXT.includes(ext as (typeof ALLOWED_EXT)[number])) {
    return { ok: false, status: 415, error: `Формат .${ext || "?"} не поддерживается` };
  }

  const cfg = await secretValues(["S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const);
  const accessKey = cfg.S3_ACCESS_KEY_ID;
  const secretKey = cfg.S3_SECRET_ACCESS_KEY;
  const bucket = process.env["S3_BUCKET"];
  if (!accessKey || !secretKey || !bucket) {
    return { ok: false, status: 503, error: "Хранилище не сконфигурировано" };
  }
  const endpoint = process.env["S3_ENDPOINT"] ?? "storage.yandexcloud.net";
  const region = process.env["S3_REGION"] ?? "ru-central1";
  const host = `${bucket}.${endpoint}`;

  const key = `leads/lead_${crypto.randomUUID()}_${base}.${ext}`;
  const contentType = filetype || "application/octet-stream";
  const expiresIn = 300; // 5 минут

  const now = new Date();
  const amz = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amz.slice(0, 8);
  const scope = `${date}/${region}/s3/aws4_request`;
  const signedHeaders = "content-type;host";

  const query = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKey}/${scope}`,
    "X-Amz-Date": amz,
    "X-Amz-Expires": String(expiresIn),
    "X-Amz-SignedHeaders": signedHeaders,
  });
  // Канонические query-параметры сортируются по имени.
  const canonicalQuery = [...query.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const canonicalPath = "/" + key.split("/").map(encodeURIComponent).join("/");
  const canonical = [
    "PUT",
    canonicalPath,
    canonicalQuery,
    `content-type:${contentType}`,
    `host:${host}`,
    "",
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amz,
    scope,
    await sha256Hex(canonical),
  ].join("\n");

  let signingKey: ArrayBuffer = await hmac(enc.encode(`AWS4${secretKey}`), date);
  signingKey = await hmac(signingKey, region);
  signingKey = await hmac(signingKey, "s3");
  signingKey = await hmac(signingKey, "aws4_request");
  const signature = hex(await hmac(signingKey, stringToSign));

  return {
    ok: true,
    key,
    expiresIn,
    uploadUrl: `https://${host}${canonicalPath}?${canonicalQuery}&X-Amz-Signature=${signature}`,
    fileUrl: `https://${host}${canonicalPath}`,
  };
}
