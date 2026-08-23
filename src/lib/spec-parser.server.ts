// Server-only: чтение «грязных» Excel/CSV спецификаций (Smart Import Engine v6.0).
// Ни одна строка клиента не теряется: каждая возвращается со статусом и пометками.
// Макросы (.xlsm/VBA) не исполняются — из книги читаются только значения ячеек.
import * as XLSX from "xlsx";
import { normalize } from "@/lib/fuzzy-search";
import { extractQuantity, matchRow, type Candidate, type RowStatus } from "@/lib/spec-matcher";
import {
  MOQ,
  ROUND_CAPS,
  applyPack,
  needsDiameter,
  parseQuantity,
  splitMixedCell,
} from "@/lib/spec-sanitize";
import { PRODUCTS, unitPrice } from "@/data/catalog";

export type SpecRowStatus = RowStatus | "NEEDS_SIZE" | "ERROR";

export type ParsedRow = {
  id: string;
  sheet: string;
  originalString: string;
  quantity: number;
  quantityRaw: string;
  status: SpecRowStatus;
  score: number;
  sku: string | null;
  name: string | null;
  notes: string[];
  error: string | null;
  candidates: Candidate[];
};

export type ParseResult = {
  sheets: string[];
  rowsScanned: number;
  matched: number;
  ambiguous: number;
  notFound: number;
  needsInput: number;
  truncated: boolean;
  columnMap: { sheet: string; sku: string | null; name: string | null; qty: string | null } | null;
  rows: ParsedRow[];
};

export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_ROWS = 5000;

/* ------------------------------------------------------------------ *
 * Сигнатуры файлов: расширение ничего не доказывает
 * ------------------------------------------------------------------ */

export type Sniff = { kind: "zip" | "cfb" | "text"; ok: boolean };

/** Первая запись ZIP должна быть частью книги OOXML, а не произвольным файлом. */
function isOoxml(b: Uint8Array): boolean {
  const nameLen = (b[27]! << 8) | b[26]!;
  if (!nameLen || 30 + nameLen > b.length) return false;
  const name = new TextDecoder("utf-8").decode(b.subarray(30, 30 + Math.min(nameLen, 64)));
  return (
    name.startsWith("[Content_Types].xml") ||
    name.startsWith("xl/") ||
    name.startsWith("_rels/") ||
    name.startsWith("docProps/")
  );
}

/** Проверка бинарного заголовка: PK.. (xlsx/xlsm), D0CF11E0 (xls), иначе текст/CSV. */
export function sniffSpec(bytes: Uint8Array, fileName: string): Sniff {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  const b = bytes;
  const isZip = b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07);
  const isCfb =
    b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0 && b[4] === 0xa1 && b[5] === 0xb1;

  // Исполняемые/скриптовые сигнатуры отбиваем явно, как бы их ни переименовали.
  const isExe = b[0] === 0x4d && b[1] === 0x5a; // MZ
  const isElf = b[0] === 0x7f && b[1] === 0x45 && b[2] === 0x4c && b[3] === 0x46;
  const isPdf = b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
  const isImage =
    (b[0] === 0xff && b[1] === 0xd8) || (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47);
  if (isExe || isElf || isPdf || isImage) return { kind: "text", ok: false };

  if (isZip) {
    const extOk = ["xlsx", "xlsm", "xls", "zip", "", "csv"].includes(ext);
    // ZIP-сигнатуры мало: у переименованного архива с malware.exe внутри её тоже видно.
    // Настоящая книга OOXML первым же локальным заголовком объявляет [Content_Types].xml
    // или каталог xl/ — иначе это просто архив, и парсер к нему не прикоснётся.
    return { kind: "zip", ok: extOk && isOoxml(b) };
  }
  if (isCfb) return { kind: "cfb", ok: true };

  if (ext === "csv" || ext === "txt") {
    const head = bytes.subarray(0, 512);
    // Текстовый файл не должен содержать нулевых байтов и управляющего мусора.
    const bad = [...head].filter((c) => c === 0 || (c < 9 && c !== 0) || (c > 13 && c < 32)).length;
    if (bad > 0) return { kind: "text", ok: false };
    // Мини-эвристика против <?php / <script
    const start = new TextDecoder("utf-8").decode(head.subarray(0, 32)).trim().toLowerCase();
    if (start.startsWith("<?php") || start.startsWith("<script") || start.startsWith("#!"))
      return { kind: "text", ok: false };
    return { kind: "text", ok: true };
  }
  return { kind: "text", ok: false };
}

/* ------------------------------------------------------------------ *
 * CSV: автоопределение кодировки (UTF-8 / Windows-1251)
 * ------------------------------------------------------------------ */

const CP1251_HIGH =
  "ЂЃ‚ѓ„…†‡€‰Љ‹ЊЌЋЏђ‘’“”•–—\u0098™љ›њќћџ\u00a0ЎўЈ¤Ґ¦§Ё©Є«¬\u00ad®Ї°±Ііґµ¶·ё№є»јЅѕї" +
  "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюя";

function decodeCp1251(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b < 0x80 ? String.fromCharCode(b) : (CP1251_HIGH[b - 0x80] ?? "?");
  return out;
}

/** Валидный UTF-8 → декодируем как UTF-8, иначе считаем файл Windows-1251. */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  try {
    const s = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return s;
  } catch {
    return decodeCp1251(bytes);
  }
}

/* ------------------------------------------------------------------ *
 * Смарт-мэппинг колонок
 * ------------------------------------------------------------------ */

const SKU_KEYS = ["артикул", "sku", "код", "кодтовара", "арт"];
const NAME_KEYS = ["наименование", "название", "номенклатура", "товар", "позиция", "материал"];
const QTY_KEYS = ["количество", "колво", "кол", "шт", "qty", "quantity", "объем"];
const HEADER_TRIGGERS = [...SKU_KEYS, ...NAME_KEYS, ...QTY_KEYS];

const cellText = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const colLetter = (i: number) => (i < 0 ? null : XLSX.utils.encode_col(i));

function findHeaderRow(rows: unknown[][]): number {
  const limit = Math.min(rows.length, 40);
  for (let i = 0; i < limit; i++) {
    const cells = (rows[i] ?? []).map((c) => normalize(cellText(c)));
    const hits = cells.filter((c) => c && HEADER_TRIGGERS.some((k) => c.includes(k))).length;
    if (hits >= 2) return i;
  }
  return -1;
}

function mapColumns(header: unknown[]) {
  let sku = -1;
  let name = -1;
  let qty = -1;
  header.forEach((raw, idx) => {
    const c = normalize(cellText(raw));
    if (!c) return;
    if (sku < 0 && SKU_KEYS.some((k) => c.includes(k))) sku = idx;
    else if (name < 0 && NAME_KEYS.some((k) => c.includes(k))) name = idx;
    else if (qty < 0 && QTY_KEYS.some((k) => c.includes(k))) qty = idx;
  });
  return { sku, name, qty };
}

/** Файла без шапки быть не должно, но бывает: определяем колонки по содержимому. */
function guessColumns(rows: unknown[][]) {
  let name = -1;
  let qty = -1;
  let sku = -1;
  const width = rows.reduce((m, r) => Math.max(m, r?.length ?? 0), 0);
  const skuRe = /^[a-zа-я]{2,6}[-\s]?[a-z0-9]{1,6}([-x][a-z0-9]{1,6})?$/i;
  for (let c = 0; c < width; c++) {
    const values = rows.map((r) => cellText(r?.[c])).filter(Boolean);
    if (!values.length) continue;
    const skuLike = values.filter((v) => skuRe.test(v) && /\d/.test(v) && /[a-z]/i.test(v)).length / values.length;
    const letters = values.filter((v) => /[a-zа-яё]{3}/i.test(v)).length / values.length;
    const numeric = values.filter((v) => /^\s*[~≈]?\s*[\d\s.,]+(шт|тыс|k)?\.?\s*$/i.test(v)).length / values.length;
    if (sku < 0 && skuLike >= 0.6) sku = c;
    else if (name < 0 && letters >= 0.5) name = c;
    else if (qty < 0 && numeric >= 0.5) qty = c;
  }
  return { sku, name, qty };
}

let seq = 0;
const nextId = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;

const priceOf = (sku: string, qty: number) => {
  const p = PRODUCTS.find((x) => x.sku === sku);
  return p ? (p.is_service ? 0 : unitPrice(p, qty)) : 0;
};

const roundCapCandidates = (qty: number): Candidate[] =>
  ROUND_CAPS.map((c) => ({
    sku: c.sku,
    name: c.name,
    dims: c.dims,
    price: priceOf(c.sku, qty),
    is_service: false,
  }));

/* ------------------------------------------------------------------ *
 * Основной проход
 * ------------------------------------------------------------------ */

export function parseSpecText(text: string): ParseResult {
  // sheetRows режет разбор на лимите: 500 000 строк не должны доехать до памяти.
  const wb = XLSX.read(text, { type: "string", raw: false, sheetRows: MAX_ROWS + 1 });
  return walk(wb);
}

export function parseSpecBuffer(buffer: ArrayBuffer): ParseResult {
  // bookVBA не запрашиваем: макросы не извлекаются и тем более не исполняются.
  // sheetRows — жёсткий предохранитель от «DDoS через Excel»: книга с сотнями тысяч
  // строк обрывается на чтении, а не после того, как съест оперативную память.
  const wb = XLSX.read(buffer, {
    type: "array",
    bookVBA: false,
    cellHTML: false,
    cellFormula: false,
    sheetRows: MAX_ROWS + 1,
  });
  return walk(wb);
}

function walk(wb: XLSX.WorkBook): ParseResult {
  const out: ParsedRow[] = [];
  let truncated = false;
  let columnMap: ParseResult["columnMap"] = null;

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: "" });
    if (!rows.length) continue;
    // Лист упёрся в sheetRows — значит книга была длиннее лимита и её обрезали на чтении.
    if (rows.length > MAX_ROWS) truncated = true;

    const headerIdx = findHeaderRow(rows);
    const cols = headerIdx >= 0 ? mapColumns(rows[headerIdx] ?? []) : guessColumns(rows);
    if (cols.name < 0 && cols.sku < 0) continue;
    if (!columnMap) {
      columnMap = {
        sheet: sheetName,
        sku: colLetter(cols.sku),
        name: colLetter(cols.name),
        qty: colLetter(cols.qty),
      };
    }
    const start = headerIdx >= 0 ? headerIdx + 1 : 0;

    for (let i = start; i < rows.length; i++) {
      if (out.length >= MAX_ROWS) {
        truncated = true;
        break;
      }
      const row = rows[i] ?? [];
      const skuRaw = cols.sku >= 0 ? cellText(row[cols.sku]) : "";
      const nameRaw = cols.name >= 0 ? cellText(row[cols.name]) : "";
      let label = [nameRaw, skuRaw].filter(Boolean).join(" ").trim();
      if (!label) continue;
      // Шапка с логотипом, разделы и итоговая строка — не товар.
      if (/^(итого|всего|сумма|раздел|подраздел|№|n\/n|подпись|заказчик|поставщик)(?![а-яёa-z])/i.test(label)) continue;

      const qtyCell = cols.qty >= 0 ? row[cols.qty] : "";
      const qtyRaw = cellText(qtyCell);
      const notes: string[] = [];
      let error: string | null = null;

      let parsed = parseQuantity(qtyCell);
      if (parsed.error) error = parsed.error;

      // Всё в одной ячейке: «Заглушка 60х60 мм - 15 000 штук срочно для цеха»
      if (parsed.qty === null && !error) {
        const mixed = splitMixedCell(label);
        if (mixed.qty !== null) {
          label = mixed.name;
          parsed = { qty: mixed.qty, note: mixed.note, error: null };
        }
      }
      if (parsed.note) notes.push(parsed.note);

      // Строки без цифр и без товарных признаков (шапка/подвал) отбрасываем.
      if (!qtyRaw && parsed.qty === null && !error && label.replace(/[^a-zа-яё]/gi, "").length < 4) continue;

      let quantity = parsed.qty ?? MOQ;
      if (parsed.qty === null && !error) {
        notes.push(
          `Количество не распознано. Автоматически подставлена минимальная партия (${MOQ} шт). Пожалуйста, проверьте и скорректируйте`,
        );
      }
      if (error) quantity = extractQuantity(qtyRaw) || MOQ;

      // Круглая заглушка без диаметра — гадать нельзя.
      if (needsDiameter(label)) {
        out.push({
          id: nextId(),
          sheet: sheetName,
          originalString: label,
          quantity,
          quantityRaw: qtyRaw,
          status: "NEEDS_SIZE",
          score: 60,
          sku: null,
          name: null,
          notes: [
            ...notes,
            "В исходном файле не указан диаметр. Пожалуйста, выберите подходящий размер из списка для продолжения",
          ],
          error,
          candidates: roundCapCandidates(quantity),
        });
        continue;
      }

      const verdict = matchRow(label, quantity);
      if (verdict.status === "MATCHED" && verdict.sku) {
        const packed = applyPack(verdict.sku, quantity);
        if (packed.note) notes.push(packed.note);
        quantity = packed.qty;
      }

      out.push({
        id: nextId(),
        sheet: sheetName,
        originalString: label,
        quantity,
        quantityRaw: qtyRaw,
        status: error ? "ERROR" : verdict.status,
        score: verdict.score,
        sku: verdict.sku,
        name: verdict.name,
        notes,
        error,
        candidates: verdict.candidates,
      });
    }
    if (truncated) break;
  }

  return {
    sheets: wb.SheetNames,
    rowsScanned: out.length,
    matched: out.filter((r) => r.status === "MATCHED").length,
    ambiguous: out.filter((r) => r.status === "AMBIGUOUS").length,
    notFound: out.filter((r) => r.status === "NOT_FOUND").length,
    needsInput: out.filter((r) => r.status === "NEEDS_SIZE" || r.status === "ERROR").length,
    truncated,
    columnMap,
    rows: out,
  };
}
