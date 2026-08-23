// PDF-смета спецификации из ИИ-конфигуратора (клиентский pdfmake, без сервера).
import { toast } from "sonner";
import { runPdfJob } from "@/lib/pdf-queue";

export type SpecRow = {
  sku: string;
  name: string;
  dims: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  on_request: boolean;
};

export type SpecInput = {
  task: string;
  logic: string;
  safety: number | null;
  rows: SpecRow[];
  total: number;
  /** Ссылка на конфигурацию: инженер откроет её и увидит тот же узел. */
  shareUrl?: string;
};

const money = (n: number) =>
  n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function generateSpecPdfImpl({
  task,
  logic,
  safety,
  rows,
  total,
  shareUrl,
}: SpecInput): Promise<void> {
  const pdfMakeModule = await import("pdfmake/build/pdfmake");
  const fontsModule = await import("pdfmake/build/vfs_fonts");
  const pdfMake = ((pdfMakeModule as unknown as { default?: unknown }).default ??
    pdfMakeModule) as unknown as {
    addVirtualFileSystem: (vfs: Record<string, unknown>) => void;
    addFonts: (fonts: Record<string, unknown>) => void;
    createPdf: (d: unknown) => { download: (n: string) => void };
  };
  const vfsSource = ((fontsModule as unknown as { default?: unknown }).default ??
    fontsModule) as Record<string, unknown> & {
    pdfMake?: { vfs?: Record<string, unknown> };
    vfs?: Record<string, unknown>;
  };
  pdfMake.addVirtualFileSystem((vfsSource.pdfMake?.vfs ?? vfsSource.vfs ?? vfsSource) as Record<string, unknown>);
  pdfMake.addFonts({
    Roboto: {
      normal: "Roboto-Regular.ttf",
      bold: "Roboto-Medium.ttf",
      italics: "Roboto-Italic.ttf",
      bolditalics: "Roboto-MediumItalic.ttf",
    },
  });

  const date = new Date().toLocaleDateString("ru-RU");

  const body = [
    [
      { text: "№", style: "th" },
      { text: "Артикул", style: "th" },
      { text: "Наименование", style: "th" },
      { text: "Кол-во", style: "th", alignment: "right" },
      { text: "Цена, ₽", style: "th", alignment: "right" },
      { text: "Сумма, ₽", style: "th", alignment: "right" },
    ],
    ...rows.map((r, i) => [
      { text: String(i + 1) },
      { text: r.sku },
      { text: `${r.name}${r.dims ? `, ${r.dims}` : ""}` },
      { text: r.quantity.toLocaleString("ru-RU"), alignment: "right" },
      { text: r.on_request ? "по запросу" : money(r.unit_price), alignment: "right" },
      { text: r.on_request ? "—" : money(r.total_price), alignment: "right" },
    ]),
  ];

  pdfMake
    .createPdf({
      pageMargins: [32, 32, 32, 40],
      defaultStyle: { font: "Roboto", fontSize: 9 },
      content: [
        { text: "ALMAFORT", style: "logo" },
        { text: `Спецификация узла от ${date}`, style: "h1", margin: [0, 6, 0, 0] },
        { text: `Задача: ${task}`, margin: [0, 8, 0, 0], color: "#595959" },
        {
          text: logic,
          margin: [0, 8, 0, 0],
          fontSize: 8.5,
          color: "#333333",
        },
        ...(safety
          ? [{ text: `Запас прочности: ${safety}×`, bold: true, margin: [0, 6, 0, 0] }]
          : []),
        {
          margin: [0, 14, 0, 0],
          table: { headerRows: 1, widths: [16, 70, "*", 48, 60, 62], body },
          layout: "lightHorizontalLines",
        },
        {
          text: `Итого: ${money(total)} ₽`,
          bold: true,
          alignment: "right",
          margin: [0, 12, 0, 0],
        },
        ...(shareUrl
          ? [
              {
                text: "Ссылка на конфигурацию (открывается в том же составе):",
                margin: [0, 16, 0, 2],
                color: "#595959",
                fontSize: 8,
              },
              { text: shareUrl, link: shareUrl, color: "#1f4fd8", fontSize: 8 },
            ]
          : []),
        {
          text: "Цены действительны 5 рабочих дней.",
          margin: [0, 16, 0, 0],
          fontSize: 8,
          color: "#595959",
        },
      ],
      styles: {
        logo: { fontSize: 20, bold: true, color: "#E52421" },
        h1: { fontSize: 13, bold: true },
        th: { bold: true, fillColor: "#F3F4F6" },
      },
    })
    .download(`Specifikaciya_Almafort_${Date.now()}.pdf`);
}

/** Публичная точка входа: рендер идёт через очередь, параллельных задач нет. */
export function generateSpecPdf(input: SpecInput): Promise<void> {
  return runPdfJob(
    () => generateSpecPdfImpl(input),
    () => toast.info("Спецификация формируется (в очереди)..."),
  );
}
