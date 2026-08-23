import { secretValues } from "@/lib/vault.server";
// Загрузка PDF-счёта в S3-совместимое хранилище (Yandex Object Storage)
// напрямую подписью AWS SigV4 — без SDK, чтобы код работал в edge-рантайме.

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

async function sha256Hex(data: Uint8Array | string) {
  const buf = typeof data === "string" ? enc.encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", buf as BufferSource);
  return hex(hash);
}

function hex(buf: ArrayBuffer) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type UploadResult = { url: string | null; skipped?: string };

/** Счёт-фактура: тот же аплоад, но с префиксом invoices/. */
export function uploadInvoice(
  fileName: string,
  bytes: Uint8Array,
  contentType = "application/pdf",
): Promise<UploadResult> {
  return uploadObject(`invoices/${fileName}`, bytes, contentType);
}

/**
 * Кладёт файл в бакет по произвольному ключу и возвращает публичную ссылку.
 * Если ключи не заданы — возвращает { url: null, skipped } и не роняет вызов.
 */
export async function uploadObject(
  key: string,
  bytes: Uint8Array,
  contentType = "application/octet-stream",
): Promise<UploadResult> {
  const cfg = await secretValues(["S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const);
  const accessKey = cfg.S3_ACCESS_KEY_ID;
  const secretKey = cfg.S3_SECRET_ACCESS_KEY;
  const bucket = process.env["S3_BUCKET"];
  if (!accessKey || !secretKey || !bucket) {
    return { url: null, skipped: "S3 не сконфигурирован" };
  }
  const endpoint = process.env["S3_ENDPOINT"] ?? "storage.yandexcloud.net";
  const region = process.env["S3_REGION"] ?? "ru-central1";
  const host = `${bucket}.${endpoint}`;
  const url = `https://${host}/${key}`;

  const now = new Date();
  const amz = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amz.slice(0, 8);
  const payloadHash = await sha256Hex(bytes);

  const canonical = [
    "PUT",
    `/${key}`,
    "",
    `content-type:${contentType}`,
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amz}`,
    "",
    "content-type;host;x-amz-content-sha256;x-amz-date",
    payloadHash,
  ].join("\n");

  const scope = `${date}/${region}/s3/aws4_request`;
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

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amz,
      Authorization:
        `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, ` +
        `SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=${signature}`,
    },
    body: bytes as BodyInit,
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`S3 upload failed [${res.status}]: ${body}`);
    return { url: null, skipped: `S3 ${res.status}` };
  }
  return { url };
}
