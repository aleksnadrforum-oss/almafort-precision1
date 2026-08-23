import { useCallback } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { FileSpreadsheet, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/store/cart-store";

const MAX_BYTES = 10 * 1024 * 1024;

const ACCEPT = {
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.ms-excel.sheet.macroEnabled.12": [".xlsm"],
  "text/csv": [".csv"],
  // Некоторые ОС отдают файл без MIME-типа — доверяем расширению, тип проверит сервер.
  "text/plain": [".csv"],
  "application/octet-stream": [".xls", ".xlsx", ".xlsm", ".csv"],
  "application/zip": [".xlsx", ".xlsm"],
};

const BAD_FORMAT = "Ошибка: Файл поврежден или имеет неверный формат. Загрузите корректный документ Excel";

/**
 * Проверка реального бинарного заголовка ещё до отправки: расширение и MIME подделываются
 * переименованием, сигнатура — нет. malware.exe → smeta.xlsx отсекается прямо в браузере,
 * трафик и время сервера на него не тратятся. Сервер повторяет проверку — фронту он не верит.
 */
async function signatureOk(file: File, ext: string): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  if (head.length < 8) return false;

  const isZip = head[0] === 0x50 && head[1] === 0x4b; // PK — xlsx/xlsm
  const isCfb = head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0; // xls
  const isExe = head[0] === 0x4d && head[1] === 0x5a; // MZ
  const isElf = head[0] === 0x7f && head[1] === 0x45 && head[2] === 0x4c && head[3] === 0x46;
  if (isExe || isElf) return false;

  if (ext === "csv") {
    if (isZip || isCfb) return false;
    // Скрипт под видом таблицы: <?php, <script, shebang, нулевые байты.
    const text = new TextDecoder("utf-8").decode(head).trim().toLowerCase();
    if (text.startsWith("<?php") || text.startsWith("<script") || text.startsWith("#!")) return false;
    return !head.includes(0);
  }
  if (ext === "xls") return isCfb || isZip;
  return isZip;
}

export function SpecUpload({ compact = false }: { compact?: boolean }) {
  const setParsing = useCart((s) => s.setParsing);
  const setReview = useCart((s) => s.setReview);
  const parsing = useCart((s) => s.parsing);

  const onDropAccepted = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      const ext = file.name.toLowerCase().split(".").pop() ?? "";
      if (!["xls", "xlsx", "xlsm", "csv"].includes(ext)) {
        toast.error(BAD_FORMAT);
        return;
      }
      if (file.size > MAX_BYTES) {
        toast.error(
          "Файл слишком велик. Максимальный размер — 10 МБ (до 5000 позиций). Разделите смету на две части",
        );
        return;
      }
      if (!(await signatureOk(file, ext))) {
        toast.error(BAD_FORMAT);
        return;
      }
      setParsing(true);
      try {
        const body = new FormData();
        body.append("file", file);
        const res = await fetch("/api/parser/upload", { method: "POST", body });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? BAD_FORMAT);
        setReview({
          fileName: json.fileName ?? file.name,
          truncated: Boolean(json.truncated),
          columnMap: json.columnMap ?? null,
          rows: json.rows ?? [],
        });
        const { matched = 0, rowsScanned = 0 } = json;
        toast.success(`Обработано ${rowsScanned} строк: ${matched} распознано`, {
          description: "Проверьте позиции перед переносом в корзину.",
          action: {
            label: "Открыть корзину",
            onClick: () => {
              window.location.href = "/cart";
            },
          },
        });
      } catch (e) {
        setParsing(false);
        toast.error(e instanceof Error ? e.message : BAD_FORMAT);
      }
    },
    [setReview, setParsing],
  );

  const onDropRejected = useCallback((rejections: FileRejection[]) => {
    const code = rejections[0]?.errors[0]?.code;
    if (code === "file-too-large")
      toast.error(
        "Файл слишком велик. Максимальный размер — 10 МБ (до 5000 позиций). Разделите смету на две части",
      );
    else toast.error(BAD_FORMAT);
  }, []);

  const { getRootProps, getInputProps, isDragActive, isDragReject, open } = useDropzone({
    accept: ACCEPT,
    maxSize: MAX_BYTES,
    multiple: false,
    noClick: false,
    onDropAccepted,
    onDropRejected,
  });

  if (parsing && !compact) return null;

  if (compact) {
    return (
      <button
        type="button"
        onClick={open}
        {...getRootProps({
          className:
            "flex min-h-[48px] cursor-pointer items-center gap-2 rounded-sm border border-[#D1D5DB] bg-[#F3F4F6] px-4 py-2.5 text-sm font-semibold text-foreground transition-colors duration-200 hover:border-primary hover:text-primary",
        })}
      >
        <input {...getInputProps()} />
        <FileSpreadsheet className="size-4" strokeWidth={1.75} />
        Загрузить спецификацию Excel
      </button>
    );
  }

  return (
    <div
      {...getRootProps({
        className:
          "flex cursor-pointer flex-col items-center justify-center gap-4 rounded-lg px-5 py-10 text-center sm:px-8 sm:py-14 transition-all duration-200",
      })}
      style={{
        border: isDragReject
          ? "2px solid #DC2626"
          : isDragActive
            ? "2px solid #E52421"
            : "2px dashed #D1D5DB",
        backgroundColor: isDragReject ? "#FEF2F2" : isDragActive ? "#F1F2F4" : "#F8F9FA",
      }}
    >
      <input {...getInputProps()} />
      {isDragActive ? (
        <UploadCloud
          className={isDragReject ? "size-12 text-[#DC2626]" : "size-12 text-primary"}
          strokeWidth={1.5}
        />
      ) : (
        <FileSpreadsheet className="size-12 text-muted-foreground" strokeWidth={1.5} />
      )}
      <p className={`text-base font-medium ${isDragReject ? "text-[#B91C1C]" : "text-foreground"}`}>
        {isDragReject
          ? "Этот формат не принимается — только .xls, .xlsx, .xlsm, .csv"
          : "Перетащите вашу спецификацию сюда (.xls, .xlsx, .csv)"}
      </p>
      <p className="text-sm text-muted-foreground">
        Алгоритм распознает артикулы, сформирует заказ и выдаст PDF-счёт. До 10 МБ.
      </p>
    </div>
  );
}

export function ParsingSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <p className="text-sm font-semibold text-foreground">Распознаем номенклатуру...</p>
      <div className="mt-5 space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="h-4 w-[18%] animate-pulse rounded bg-[#E5E7EB]" />
            <div className="h-4 flex-1 animate-pulse rounded bg-[#EDEEF0]" />
            <div className="h-4 w-[10%] animate-pulse rounded bg-[#E5E7EB]" />
            <div className="h-4 w-[12%] animate-pulse rounded bg-[#EDEEF0]" />
          </div>
        ))}
      </div>
    </div>
  );
}
