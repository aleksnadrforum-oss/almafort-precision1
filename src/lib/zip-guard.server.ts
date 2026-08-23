/**
 * Предохранитель для OOXML-контейнеров (.xlsx/.xlsm — это ZIP с XML внутри).
 *
 * Закрывает три класса атак до того, как файл попадёт в парсер:
 *  1. Zip bomb — 50 КБ на входе, десятки гигабайт после распаковки.
 *     Считаем сумму несжатых размеров и коэффициент сжатия по заголовкам,
 *     не распаковывая содержимое.
 *  2. XXE — внедрённый <!DOCTYPE ... <!ENTITY xxe SYSTEM "file:///etc/passwd">
 *     в sharedStrings.xml. Инфлейтим только XML-части и ищем DOCTYPE/ENTITY.
 *  3. VBA — vbaProject.bin отмечаем и не отдаём парсеру (макросы не исполняются,
 *     бинарный кусок проекта просто игнорируется).
 */

export type ZipVerdict =
  | { ok: true; entries: number; inflatedBytes: number; hadVba: boolean }
  | { ok: false; reason: "bomb" | "xxe" | "corrupt"; detail: string };

/** Жёсткий потолок распакованных данных книги. */
export const MAX_INFLATED_BYTES = 50 * 1024 * 1024;
/** Максимальный допустимый коэффициент сжатия (обычный xlsx редко >20). */
export const MAX_RATIO = 120;
export const MAX_ENTRIES = 512;

const u16 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
const u32 = (b: Uint8Array, o: number) =>
  (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;

type Entry = {
  name: string;
  method: number;
  compressed: number;
  uncompressed: number;
  dataStart: number;
};

/** Разбор локальных заголовков ZIP без распаковки. */
function listEntries(b: Uint8Array): Entry[] | null {
  const out: Entry[] = [];
  let p = 0;
  while (p + 30 <= b.length && u32(b, p) === 0x04034b50) {
    const method = u16(b, p + 8);
    const flags = u16(b, p + 6);
    let compressed = u32(b, p + 18);
    let uncompressed = u32(b, p + 22);
    const nameLen = u16(b, p + 26);
    const extraLen = u16(b, p + 28);
    const name = new TextDecoder("utf-8").decode(b.subarray(p + 30, p + 30 + nameLen));
    const dataStart = p + 30 + nameLen + extraLen;
    if (dataStart > b.length) return null;

    // Data descriptor (bit 3): размеры лежат после данных — берём их из central directory.
    if (flags & 0x08 && (compressed === 0 || uncompressed === 0)) {
      const fromCd = sizesFromCentralDirectory(b, name);
      if (!fromCd) return null;
      compressed = fromCd.compressed;
      uncompressed = fromCd.uncompressed;
    }
    out.push({ name, method, compressed, uncompressed, dataStart });
    p = dataStart + compressed;
    if (out.length > MAX_ENTRIES) break;
  }
  return out.length ? out : null;
}

function sizesFromCentralDirectory(b: Uint8Array, name: string) {
  for (let p = 0; p + 46 <= b.length; p++) {
    if (u32(b, p) !== 0x02014b50) continue;
    const nameLen = u16(b, p + 28);
    const entryName = new TextDecoder("utf-8").decode(b.subarray(p + 46, p + 46 + nameLen));
    if (entryName === name) {
      return { compressed: u32(b, p + 20), uncompressed: u32(b, p + 24) };
    }
  }
  return null;
}

async function inflateRaw(chunk: Uint8Array, limit: number): Promise<string> {
  const stream = new Blob([chunk as unknown as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8");
  let text = "";
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    text += decoder.decode(value, { stream: true });
    if (total > limit) {
      await reader.cancel().catch(() => {});
      break;
    }
  }
  return text;
}

const XXE_RE = /<!DOCTYPE|<!ENTITY|SYSTEM\s+["']|PUBLIC\s+["']|file:\/\/|\bxi:include\b/i;

/** Проверяет книгу OOXML перед парсингом. Ничего не пишет на диск. */
export async function inspectOoxml(bytes: Uint8Array): Promise<ZipVerdict> {
  const entries = listEntries(bytes);
  if (!entries) return { ok: false, reason: "corrupt", detail: "ZIP-структура нечитаема" };

  let inflated = 0;
  let hadVba = false;
  for (const e of entries) {
    inflated += e.uncompressed;
    if (e.name.toLowerCase().includes("vbaproject")) hadVba = true;
    const ratio = e.compressed > 0 ? e.uncompressed / e.compressed : e.uncompressed > 0 ? Infinity : 0;
    if (inflated > MAX_INFLATED_BYTES || ratio > MAX_RATIO) {
      return {
        ok: false,
        reason: "bomb",
        detail: `Распакованный объём ${Math.round(inflated / 1048576)} МБ / коэффициент ${Math.round(ratio)}`,
      };
    }
  }

  // XML-части инфлейтим и осматриваем: внешние сущности внутри книги недопустимы.
  for (const e of entries) {
    if (!/\.(xml|rels)$/i.test(e.name)) continue;
    if (e.compressed > 4 * 1024 * 1024) continue;
    const chunk = bytes.subarray(e.dataStart, e.dataStart + e.compressed);
    let text: string;
    try {
      text = e.method === 0 ? new TextDecoder("utf-8").decode(chunk) : await inflateRaw(chunk, 8 * 1024 * 1024);
    } catch {
      continue;
    }
    if (XXE_RE.test(text)) {
      return { ok: false, reason: "xxe", detail: `Внешние сущности в ${e.name}` };
    }
  }

  return { ok: true, entries: entries.length, inflatedBytes: inflated, hadVba };
}
