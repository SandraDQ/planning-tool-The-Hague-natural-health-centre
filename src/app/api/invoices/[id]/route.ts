import { renderInvoicePdf } from "@/lib/invoicing/pdf";
import { getStore, isDemoMode } from "@/lib/server/data";
import { invoiceFileName } from "@/lib/server/invoicing/deliver";
import { logSafeError } from "@/lib/server/errors";
import { getSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/invoices/:id → the invoice PDF, for the person it belongs to (the client, the
 * therapist who issued or received it, the admin for room rent). Anyone else gets 404.
 * `?download=1` saves it instead of opening it in the browser.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  try {
    const session = await getSession();
    if (!session || typeof id !== "string" || id.length > 100) return notFound();
    const invoice = await getStore().invoices.getForViewer(session, id);
    const pdf = await renderInvoicePdf(invoice, { demo: isDemoMode() });
    const download = new URL(request.url).searchParams.get("download") === "1";
    return new Response(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${invoiceFileName(invoice)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (!(e instanceof Error && e.name === "DomainError")) logSafeError("[invoice pdf]", e);
    return notFound();
  }
}
