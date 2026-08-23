import { createClientOnlyFn } from "@tanstack/react-start";
import type { InvoiceInput } from "@/lib/invoice-pdf";
import type { SpecInput } from "@/lib/spec-pdf";

/**
 * Единственные точки входа в браузерные PDF-модули. TanStack заменяет тела
 * createClientOnlyFn в серверной сборке, поэтому pdfmake и VFS не попадают в SSR-граф.
 */
export const generateInvoicePdfInBrowser = createClientOnlyFn(async (input: InvoiceInput) => {
  const { generateInvoicePdf } = await import("@/lib/invoice-pdf");
  return generateInvoicePdf(input);
});

export const generateSpecPdfInBrowser = createClientOnlyFn(async (input: SpecInput) => {
  const { generateSpecPdf } = await import("@/lib/spec-pdf");
  return generateSpecPdf(input);
});