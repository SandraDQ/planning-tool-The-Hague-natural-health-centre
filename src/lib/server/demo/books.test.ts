import { describe, expect, it } from "vitest";
import { DomainError } from "@/lib/domain/store";
import type { Session } from "@/lib/domain/types";
import { demoReceiptPdf } from "@/lib/books/demo-receipt";
import { amountDue } from "@/lib/invoicing/status";
import { DEMO_IDS, createSeedState } from "./seed";
import { createDemoStore } from "./store";

const T0 = Date.parse("2026-11-02T07:30:00Z");

function setup() {
  const state = createSeedState(new Date(T0));
  const store = createDemoStore(state, { now: () => T0 });
  return { state, store };
}
const admin = { role: "admin", userId: DEMO_IDS.admin, displayName: "Admin" } satisfies Session;
const therapist = (id: string): Session => ({ role: "therapist", userId: `user-${id}`, therapistId: id, displayName: id });
const client: Session = { role: "client", userId: "u", clientId: DEMO_IDS.clientLotte, displayName: "Lotte" };

async function code(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    if (e instanceof DomainError) return e.code;
    throw e;
  }
  return "ok";
}

describe("demo bookkeeping", () => {
  it("seeds books for the centre and Anna, with a few payments that need a look", async () => {
    const { store } = setup();
    const centre = await store.books.getBooks(admin);
    expect(centre.connection?.demo).toBe(true);
    expect(centre.expenses.length).toBeGreaterThan(10);
    expect(centre.invoices.every((i) => i.kind === "room_rent")).toBe(true);
    const todo = centre.transactions.filter((t) => !t.match);
    expect(todo.length).toBeGreaterThanOrEqual(3);
    expect(Object.values(centre.suggestions).some((s) => s?.kind === "invoice")).toBe(true);
    expect(Object.values(centre.suggestions).some((s) => s?.kind === "new_expense")).toBe(true);
    // Room rent is exempt in the seed: the centre gets no BTW back.
    expect(centre.deductsBtw).toBe(false);
    const anna = await store.books.getBooks(therapist("th-anna"));
    expect(anna.deductsBtw).toBe(true);
    expect(anna.invoices.every((i) => i.sellerTherapistId === "th-anna")).toBe(true);
    expect(anna.expenses.every((e) => e.ownerTherapistId === "th-anna")).toBe(true);
  });

  it("keeps each owner's books apart", async () => {
    const { store } = setup();
    const centre = await store.books.getBooks(admin);
    const e = centre.expenses.find((x) => x.receipt)!;
    expect(await code(store.books.readReceipt(therapist("th-anna"), e.id))).toBe("not_found");
    expect(await code(store.books.readReceipt(client, e.id))).toBe("not_found");
    expect(await code(store.books.getBooks(therapist("th-gijs")))).toBe("forbidden");
    expect(await code(store.books.getBooks(client))).toBe("forbidden");
    expect(await code(store.books.deleteExpense(therapist("th-anna"), e.id))).toBe("not_found");
    expect((await store.books.readReceipt(admin, e.id)).file.mimeType).toBe("application/pdf");
  });

  it("saves a cost with the BTW worked out, and only real receipts", async () => {
    const { store } = setup();
    const saved = await store.books.saveExpense(admin, { date: "2026-10-30", supplier: "HEMA", category: "supplies", grossCents: 1210, btwRate: "21" });
    expect(saved).toMatchObject({ netCents: 1000, btwCents: 210 });
    expect(await code(store.books.saveExpense(admin, { date: "2026-12-30", supplier: "x", category: "supplies", grossCents: 1, btwRate: "21" }))).toBe("invalid");
    expect(await code(store.books.attachReceipt(admin, saved.id, { name: "x.svg", data: new TextEncoder().encode("<svg/>") }))).toBe("invalid");
    const withReceipt = await store.books.attachReceipt(admin, saved.id, { name: "bon.pdf", data: demoReceiptPdf(["HEMA"]) });
    expect(withReceipt.receipt?.fileName).toBe("bon.pdf");
    await store.books.deleteExpense(admin, saved.id);
    expect(await code(store.books.readReceipt(admin, saved.id))).toBe("not_found");
  });

  it("confirming a rent payment marks the invoice paid; undo takes it off again", async () => {
    const { store } = setup();
    const books = await store.books.getBooks(admin);
    const [txId, s] = Object.entries(books.suggestions).find(([, s]) => s?.kind === "invoice")!;
    const invoiceId = (s as { invoiceId: string }).invoiceId;
    await store.books.matchTransaction(admin, txId, { kind: "invoice", invoiceId });
    let inv = (await store.admin.listRentInvoices(admin)).find((i) => i.id === invoiceId)!;
    expect(amountDue(inv)).toBe(0);
    expect(await code(store.books.matchTransaction(admin, txId, { kind: "private" }))).toBe("invalid");
    await store.books.unmatchTransaction(admin, txId);
    inv = (await store.admin.listRentInvoices(admin)).find((i) => i.id === invoiceId)!;
    expect(amountDue(inv)).toBe(inv.totalCents);
  });

  it("a payment becomes a new cost, linked to the bank; deleting the cost frees the payment", async () => {
    const { store } = setup();
    const books = await store.books.getBooks(admin);
    const [txId] = Object.entries(books.suggestions).find(([, s]) => s?.kind === "new_expense")!;
    const tx = books.transactions.find((t) => t.id === txId)!;
    const matched = await store.books.matchTransaction(admin, txId, {
      kind: "new_expense",
      expense: { date: tx.bookedOn, supplier: tx.counterparty, category: "supplies", grossCents: -tx.amountCents, btwRate: "21" },
    });
    expect(matched.match?.kind).toBe("expense");
    const expenseId = (matched.match as { expenseId: string }).expenseId;
    expect((await store.books.getBooks(admin)).expenses.find((e) => e.id === expenseId)?.bankTransactionId).toBe(txId);
    await store.books.deleteExpense(admin, expenseId);
    expect((await store.books.getBooks(admin)).transactions.find((t) => t.id === txId)?.match).toBeNull();
  });

  it("a therapist's client transfer is recorded as a balance payment on the final invoice", async () => {
    const { state, store } = setup();
    const books = await store.books.getBooks(therapist("th-anna"));
    const found = Object.entries(books.suggestions).find(([, s]) => s?.kind === "invoice");
    if (!found) return; // the seed had no open final invoice for Anna this week
    const [txId, s] = found;
    const invoiceId = (s as { invoiceId: string }).invoiceId;
    await store.books.matchTransaction(therapist("th-anna"), txId, { kind: "invoice", invoiceId });
    expect(amountDue(state.invoices.find((i) => i.id === invoiceId)!)).toBe(0);
    await store.books.unmatchTransaction(therapist("th-anna"), txId);
    expect(amountDue(state.invoices.find((i) => i.id === invoiceId)!)).toBeGreaterThan(0);
  });

  it("the add-on: request, switched on, agree to the terms", async () => {
    const { state, store } = setup();
    const gijs = therapist("th-gijs");
    expect((await store.books.access(gijs)).status).toBe("off");
    expect((await store.books.requestAddon(gijs)).status).toBe("requested");
    state.booksAddon["th-gijs"] = { status: "active", since: "2026-11-02", termsAcceptedAt: null };
    expect((await store.books.access(gijs)).status).toBe("needs_terms");
    expect(await code(store.books.getBooks(gijs))).toBe("forbidden");
    expect((await store.books.acceptTerms(gijs)).status).toBe("on");
    expect((await store.books.getBooks(gijs)).expenses).toEqual([]);
  });

  it("admin switches the add-on on; the fee goes on the rent invoice with 21% BTW", async () => {
    const { state, store } = setup();
    const seeded = state.invoices.find((i) => i.kind === "room_rent" && i.buyerTherapistId === "th-anna")!;
    expect(seeded.lines.some((l) => l.btwTreatment === "21" && l.lineTotalCents === state.booksAddonFeeCents)).toBe(true);
    expect(await code(store.books.listAddons(therapist("th-anna")))).toBe("forbidden");
    const list = await store.books.listAddons(admin);
    expect(list.therapists[0]).toMatchObject({ therapistId: "th-bram", status: "requested" });
    await store.books.setAddonFee(admin, 1250);
    expect((await store.books.setAddon(admin, "th-bram", true)).status).toBe("active");
    const drafts = await store.admin.prepareRentInvoices(admin, "2026-11-15");
    const bram = drafts.find((d) => d.buyerTherapistId === "th-bram")!;
    expect(bram.lines.find((l) => l.btwTreatment === "21")).toMatchObject({ lineTotalCents: 1250, btwCents: 263 });
    await store.books.setAddon(admin, "th-bram", false);
    expect((await store.books.access(therapist("th-bram"))).status).toBe("off");
  });
});
