// Санитайзер входящих кадров ИИ-камеры.
// Не доверяем ни расширению, ни MIME из data-URL: проверяем бинарную сигнатуру и
// вырезаем все метаданные (EXIF/XMP/ICC/комментарии), в которых прячут полезную
// нагрузку. Наружу отдаём чистый буфер, пересобранный из проверенных сегментов.

export type SanitizedImage = {
  bytes: Uint8Array;
  mime: "image/jpeg" | "image/png" | "image/webp";
  /** data:URL без метаданных — в таком виде уходит в мультимодальную модель. */
  dataUrl: string;
  strippedBytes: number;
};

const MAX_BYTES = 3_000_000;

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function decodeDataUrl(dataUrl: string): Uint8Array | null {
  const m = dataUrl.match(/^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!m) return null;
  try {
    const bin = atob(m[1]!.replace(/\s+/g, ""));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/**
 * JPEG: пересобираем поток, выбрасывая все APPn (EXIF, XMP, ICC, Photoshop) и COM.
 * Всё, что не является валидным маркером, обрывает разбор — «жpg с довеском» отсеивается.
 */
function stripJpeg(bytes: Uint8Array): Uint8Array | null {
  if (!(bytes[0] === 0xff && bytes[1] === 0xd8)) return null;
  const out: Array<Uint8Array> = [bytes.subarray(0, 2)];
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    let marker = bytes[i + 1]!;
    while (marker === 0xff) {
      i++;
      marker = bytes[i + 1]!;
    }
    if (marker === 0xd9) {
      out.push(new Uint8Array([0xff, 0xd9]));
      break;
    }
    if (marker === 0xda) {
      // Начало сканирования: до конца потока данные изображения, метаданных там нет.
      out.push(bytes.subarray(i));
      break;
    }
    const len = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    if (len < 2 || i + 2 + len > bytes.length) return null;
    const isMeta = (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe;
    if (!isMeta) out.push(bytes.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  const total = out.reduce((n, c) => n + c.length, 0);
  const merged = new Uint8Array(total);
  let off = 0;
  for (const c of out) {
    merged.set(c, off);
    off += c.length;
  }
  return merged;
}

/** PNG: оставляем только критические чанки, tEXt/iTXt/eXIf выбрасываем. */
function stripPng(bytes: Uint8Array): Uint8Array | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!sig.every((b, i) => bytes[i] === b)) return null;
  const keep = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB"]);
  const out: Array<Uint8Array> = [bytes.subarray(0, 8)];
  let i = 8;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  while (i + 8 <= bytes.length) {
    const len = view.getUint32(i);
    const name = String.fromCharCode(bytes[i + 4]!, bytes[i + 5]!, bytes[i + 6]!, bytes[i + 7]!);
    const end = i + 12 + len;
    if (len > bytes.length || end > bytes.length) return null;
    if (keep.has(name)) out.push(bytes.subarray(i, end));
    i = end;
    if (name === "IEND") break;
  }
  const total = out.reduce((n, c) => n + c.length, 0);
  const merged = new Uint8Array(total);
  let off = 0;
  for (const c of out) {
    merged.set(c, off);
    off += c.length;
  }
  return merged;
}

/** WebP: RIFF-контейнер, из него убираем чанки EXIF/XMP. */
function stripWebp(bytes: Uint8Array): Uint8Array | null {
  const ascii = (o: number, n: number) =>
    String.fromCharCode(...Array.from(bytes.subarray(o, o + n)));
  if (ascii(0, 4) !== "RIFF" || ascii(8, 4) !== "WEBP") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: Array<Uint8Array> = [];
  let i = 12;
  while (i + 8 <= bytes.length) {
    const name = ascii(i, 4);
    const len = view.getUint32(i + 4, true);
    const padded = len + (len % 2);
    const end = i + 8 + padded;
    if (end > bytes.length) break;
    if (name !== "EXIF" && name !== "XMP ") chunks.push(bytes.subarray(i, end));
    i = end;
  }
  if (!chunks.length) return null;
  const body = chunks.reduce((n, c) => n + c.length, 0);
  const merged = new Uint8Array(12 + body);
  merged.set(bytes.subarray(0, 12));
  let off = 12;
  for (const c of chunks) {
    merged.set(c, off);
    off += c.length;
  }
  new DataView(merged.buffer).setUint32(4, merged.length - 8, true);
  return merged;
}

/**
 * Единая точка входа: сигнатура → очистка метаданных → чистый data-URL.
 * Возвращает null для всего, что не является настоящим JPEG/PNG/WebP.
 */
export function sanitizeImageDataUrl(dataUrl: string): SanitizedImage | null {
  const raw = decodeDataUrl(dataUrl);
  if (!raw || raw.length < 64 || raw.length > MAX_BYTES) return null;

  let bytes: Uint8Array | null = null;
  let mime: SanitizedImage["mime"] | null = null;
  if (raw[0] === 0xff && raw[1] === 0xd8) {
    bytes = stripJpeg(raw);
    mime = "image/jpeg";
  } else if (raw[0] === 0x89 && raw[1] === 0x50) {
    bytes = stripPng(raw);
    mime = "image/png";
  } else if (raw[0] === 0x52 && raw[1] === 0x49) {
    bytes = stripWebp(raw);
    mime = "image/webp";
  }
  if (!bytes || !mime) return null;

  return {
    bytes,
    mime,
    dataUrl: `data:${mime};base64,${toBase64(bytes)}`,
    strippedBytes: raw.length - bytes.length,
  };
}
