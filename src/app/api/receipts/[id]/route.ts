import { getStore } from "@/lib/server/data";
import { logSafeError } from "@/lib/server/errors";
import { getSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/** GET /api/receipts/:expenseId → the receipt photo or PDF, for the owner of the books only. Anyone else gets 404. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  try {
    const session = await getSession();
    if (!session || typeof id !== "string" || id.length > 100) return notFound();
    const { file, data } = await getStore().books.readReceipt(session, id);
    return new Response(Buffer.from(data), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `inline; filename="${file.fileName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (!(e instanceof Error && e.name === "DomainError")) logSafeError("[receipt]", e);
    return notFound();
  }
}
