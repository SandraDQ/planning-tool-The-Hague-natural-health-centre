// Bookkeeping in the demo store (D40–D47): costs with receipts, a pretend bank feed and
// matching. The owner is the centre (admin, ownerTherapistId null) or a therapist with the
// add-on switched on and the processing terms accepted. Everything is scoped to the owner.

import { randomUUID } from "node:crypto";
import { COST_CATEGORIES } from "@/lib/books/categories";
import { demoReceiptPdf } from "@/lib/books/demo-receipt";
import { suggestMatch, type MatchSuggestion } from "@/lib/books/matching";
import { RECEIPT_EXT, RECEIPT_MAX_BYTES, safeFileName, sniffReceipt } from "@/lib/books/receipt-file";
import { DomainError, type DomainErrorCode } from "@/lib/domain/store";
import type { BankConnection, BankTransaction, BtwTreatment, CostCategory, Expense, Id, Invoice, Session } from "@/lib/domain/types";
import { btwByRate, splitGross } from "@/lib/invoicing/btw";
import { amountDue } from "@/lib/invoicing/status";
import type { BooksAccess, BooksAddonRow, BooksData, BooksStore, ExpenseInput } from "../extensions";
import { stableId } from "./ids";
import { syncFinalInvoice } from "./invoicing";
import type { DemoState } from "./state";
import { addDays, iso, isDate, localDateOf } from "./time";

const clone = <T>(x: T): T => structuredClone(x);
function fail(code: DomainErrorCode, message?: string): never {
  throw new DomainError(code, message);
}

/** Bank consent length (PSD2 allows up to 180 days with most banks). */
const CONSENT_DAYS = 180;
const CENTRE_NAME = "The Hague Natural Health Centre";
const RATES: BtwTreatment[] = ["21", "9", "exempt"];

// ------------------------------------------------------------------ helpers --

function makeExpense(owner: Id | null, input: ExpenseInput, id: Id, createdAt: string): Expense {
  const { netCents, btwCents } = splitGross(input.grossCents, input.btwRate);
  return {
    id,
    ownerTherapistId: owner,
    date: input.date,
    supplier: input.supplier.trim(),
    description: (input.description ?? "").trim(),
    category: input.category,
    grossCents: input.grossCents,
    btwRate: input.btwRate,
    netCents,
    btwCents,
    receipt: null,
    bankTransactionId: null,
    createdAt,
  };
}

function checkExpense(input: ExpenseInput | undefined, today: string): ExpenseInput {
  if (!input || typeof input !== "object") fail("invalid");
  if (!isDate(input.date) || input.date > today) fail("invalid", "Choose the date on the receipt (not in the future)");
  if (typeof input.supplier !== "string" || !input.supplier.trim() || input.supplier.length > 120) fail("invalid", "Fill in where you bought it");
  if (input.description !== undefined && (typeof input.description !== "string" || input.description.length > 300)) fail("invalid");
  if (!COST_CATEGORIES.includes(input.category)) fail("invalid", "Choose what it was for");
  if (!Number.isInteger(input.grossCents) || input.grossCents < 1 || input.grossCents > 10_000_000) fail("invalid", "Fill in the amount you paid");
  if (!RATES.includes(input.btwRate)) fail("invalid", "Choose the BTW on the receipt");
  return input;
}

/** Sales invoices of an owner: the centre's room rent, or a therapist's client invoices. */
function salesOf(state: DemoState, owner: Id | null): Invoice[] {
  return state.invoices.filter(
    (i) => i.status === "issued" && (owner === null ? i.sellerType === "centre" && i.kind === "room_rent" : i.sellerTherapistId === owner),
  );
}

/** BTW comes back on costs only for owners who charge BTW: not with the KOR, not with only exempt sales. */
function btwPosition(state: DemoState, owner: Id | null): { deductsBtw: boolean; btwNote: BooksData["btwNote"] } {
  if (owner === null) {
    const taxed = state.rentRates.some((r) => r.btwTreatment !== "exempt");
    return { deductsBtw: taxed, btwNote: taxed ? null : "exempt" };
  }
  const b = state.business.find((x) => x.therapistId === owner);
  if (b?.kor) return { deductsBtw: false, btwNote: "kor" };
  const t = b?.btwTreatment ?? "exempt";
  return t === "exempt" ? { deductsBtw: false, btwNote: "exempt" } : { deductsBtw: true, btwNote: null };
}

const ownerName = (state: DemoState, owner: Id | null) =>
  owner === null ? CENTRE_NAME : (state.business.find((b) => b.therapistId === owner)?.tradeName ?? state.therapists.find((t) => t.id === owner)?.displayName ?? "");

function suggestionsFor(state: DemoState, owner: Id | null): Record<Id, MatchSuggestion> {
  const openInvoices = salesOf(state, owner).filter((i) => i.kind !== "credit_note" && amountDue(i) > 0);
  const unlinkedExpenses = state.expenses.filter((e) => e.ownerTherapistId === owner && !e.bankTransactionId);
  const out: Record<Id, MatchSuggestion> = {};
  for (const t of state.bankTransactions) if (t.ownerTherapistId === owner && !t.match) out[t.id] = suggestMatch(t, { openInvoices, unlinkedExpenses });
  return out;
}

// --------------------------------------------------------------------- area --

export function createBooksArea(state: DemoState, deps: { now: () => number; tick: () => void }): BooksStore {
  const { now, tick } = deps;
  const today = () => localDateOf(now());

  function access(session: Session): BooksAccess {
    tick();
    const feeCents = state.booksAddonFeeCents;
    if (session?.role === "admin") return { status: "on", feeCents };
    if (session?.role !== "therapist" || !session.therapistId || !state.therapists.some((t) => t.id === session.therapistId)) fail("forbidden");
    const addon = state.booksAddon[session.therapistId!];
    if (!addon) return { status: "off", feeCents };
    if (addon.status === "requested") return { status: "requested", feeCents };
    return { status: addon.termsAcceptedAt ? "on" : "needs_terms", feeCents };
  }

  /** The books this session may use; anything else is refused. */
  function owner(session: Session): Id | null {
    if (access(session).status !== "on") fail("forbidden", "Bookkeeping is not switched on");
    return session!.role === "admin" ? null : session!.therapistId!;
  }

  function ownExpense(o: Id | null, id: Id): Expense {
    const e = state.expenses.find((x) => x.id === id && x.ownerTherapistId === o);
    if (!e) fail("not_found");
    return e!;
  }

  function ownTransaction(o: Id | null, id: Id): BankTransaction {
    const t = state.bankTransactions.find((x) => x.id === id && x.ownerTherapistId === o);
    if (!t) fail("not_found");
    return t!;
  }

  function dropReceipt(e: Expense) {
    if (e.receipt) delete state.receiptData[e.receipt.id];
    e.receipt = null;
  }

  /** Takes a payment that was marked on an invoice off again. */
  function undoInvoiceMatch(o: Id | null, t: BankTransaction) {
    if (t.match?.kind !== "invoice") return;
    const inv = state.invoices.find((i) => i.id === (t.match as { invoiceId: Id }).invoiceId);
    if (!inv) return;
    if (o === null) {
      inv.paidCents = Math.max(0, inv.paidCents - t.amountCents);
      if (inv.paidCents < inv.totalCents) inv.paidOn = null;
    } else if (t.match.balancePaymentId) {
      state.balancePayments = state.balancePayments.filter((p) => p.id !== (t.match as { balancePaymentId: Id }).balancePaymentId);
      const a = state.appointments.find((x) => x.id === inv.appointmentId);
      if (a) syncFinalInvoice(state, a, now());
    }
  }

  function asAdmin(session: Session) {
    tick();
    if (session?.role !== "admin") fail("forbidden");
  }

  function addonRow(therapistId: Id): BooksAddonRow {
    const t = state.therapists.find((x) => x.id === therapistId)!;
    const a = state.booksAddon[therapistId];
    return { therapistId, name: t.displayName, status: a?.status ?? "off", since: a?.since ?? null, termsAccepted: !!a?.termsAcceptedAt };
  }

  function connectionOf(o: Id | null) {
    return state.bankConnections.find((c) => c.ownerTherapistId === o) ?? null;
  }

  return {
    async access(session) {
      return access(session);
    },

    async requestAddon(session) {
      const a = access(session);
      if (session?.role !== "therapist") fail("forbidden");
      if (a.status === "off") state.booksAddon[session.therapistId!] = { status: "requested", since: today(), termsAcceptedAt: null };
      return access(session);
    },

    async acceptTerms(session) {
      const a = access(session);
      if (session?.role !== "therapist") fail("forbidden");
      if (a.status !== "needs_terms") fail("invalid", "Bookkeeping is not switched on for you yet");
      state.booksAddon[session.therapistId!].termsAcceptedAt = iso(now());
      return access(session);
    },

    async getBooks(session) {
      const o = owner(session);
      return clone({
        ownerName: ownerName(state, o),
        ...btwPosition(state, o),
        invoices: salesOf(state, o),
        expenses: state.expenses.filter((e) => e.ownerTherapistId === o).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
        transactions: state.bankTransactions.filter((t) => t.ownerTherapistId === o).sort((a, b) => b.bookedOn.localeCompare(a.bookedOn)),
        connection: connectionOf(o),
        suggestions: suggestionsFor(state, o),
      });
    },

    async saveExpense(session, input) {
      const o = owner(session);
      const valid = checkExpense(input, today());
      if (input.id) {
        const e = ownExpense(o, input.id);
        const next = makeExpense(o, valid, e.id, e.createdAt);
        Object.assign(e, { ...next, receipt: e.receipt, bankTransactionId: e.bankTransactionId });
        return clone(e);
      }
      const e = makeExpense(o, valid, randomUUID(), iso(now()));
      state.expenses.push(e);
      return clone(e);
    },

    async deleteExpense(session, expenseId) {
      const o = owner(session);
      const e = ownExpense(o, expenseId);
      dropReceipt(e);
      const t = state.bankTransactions.find((x) => x.id === e.bankTransactionId);
      if (t) t.match = null;
      state.expenses = state.expenses.filter((x) => x !== e);
    },

    async attachReceipt(session, expenseId, file) {
      const o = owner(session);
      const e = ownExpense(o, expenseId);
      if (!(file?.data instanceof Uint8Array) || file.data.length === 0) fail("invalid", "Choose a photo or PDF of the receipt");
      if (file.data.length > RECEIPT_MAX_BYTES) fail("invalid", "The file is too big (at most 5 MB)");
      const mimeType = sniffReceipt(file.data);
      if (!mimeType) fail("invalid", "Use a photo (JPG, PNG) or a PDF");
      dropReceipt(e);
      const id = randomUUID();
      state.receiptData[id] = new Uint8Array(file.data);
      e.receipt = { id, fileName: safeFileName(String(file.name ?? ""), RECEIPT_EXT[mimeType!]), mimeType: mimeType!, bytes: file.data.length, uploadedAt: iso(now()) };
      return clone(e);
    },

    async removeReceipt(session, expenseId) {
      const e = ownExpense(owner(session), expenseId);
      dropReceipt(e);
      return clone(e);
    },

    async readReceipt(session, expenseId) {
      let o: Id | null;
      try {
        o = owner(session);
      } catch {
        fail("not_found");
      }
      const e = state.expenses.find((x) => x.id === expenseId && x.ownerTherapistId === o!);
      const data = e?.receipt ? state.receiptData[e.receipt.id] : undefined;
      if (!e?.receipt || !data) fail("not_found");
      return { file: clone(e!.receipt!), data: new Uint8Array(data!) };
    },

    async matchTransaction(session, transactionId, match) {
      const o = owner(session);
      const t = ownTransaction(o, transactionId);
      if (t.match) fail("invalid", "This payment was already sorted out");
      const incoming = t.amountCents > 0;
      switch (match?.kind) {
        case "invoice": {
          if (!incoming) fail("invalid");
          const inv = salesOf(state, o).find((i) => i.id === match.invoiceId && i.kind !== "credit_note");
          if (!inv) fail("not_found");
          if (amountDue(inv!) <= 0) fail("invalid", "This invoice is already paid");
          if (o === null) {
            inv!.paidCents = Math.min(inv!.totalCents, inv!.paidCents + t.amountCents);
            if (inv!.paidCents >= inv!.totalCents) inv!.paidOn = t.bookedOn;
            t.match = { kind: "invoice", invoiceId: inv!.id, balancePaymentId: null };
          } else {
            const a = state.appointments.find((x) => x.id === inv!.appointmentId);
            if (!a) fail("invalid", "This invoice has no appointment");
            const payment = { id: randomUUID(), appointmentId: a!.id, method: "transfer" as const, amountCents: Math.min(t.amountCents, amountDue(inv!)), paidOn: t.bookedOn };
            state.balancePayments.push(payment);
            syncFinalInvoice(state, a!, now());
            t.match = { kind: "invoice", invoiceId: inv!.id, balancePaymentId: payment.id };
          }
          break;
        }
        case "expense": {
          if (incoming) fail("invalid");
          const e = ownExpense(o, match.expenseId);
          if (e.bankTransactionId) fail("invalid", "This cost is already linked to a payment");
          e.bankTransactionId = t.id;
          t.match = { kind: "expense", expenseId: e.id };
          break;
        }
        case "new_expense": {
          if (incoming) fail("invalid");
          const e = makeExpense(o, checkExpense(match.expense, today()), randomUUID(), iso(now()));
          e.bankTransactionId = t.id;
          state.expenses.push(e);
          t.match = { kind: "expense", expenseId: e.id };
          break;
        }
        case "other_income":
          if (!incoming) fail("invalid");
          t.match = { kind: "other_income" };
          break;
        case "counted":
        case "private":
          t.match = { kind: match.kind };
          break;
        default:
          fail("invalid");
      }
      return clone(t);
    },

    async unmatchTransaction(session, transactionId) {
      const o = owner(session);
      const t = ownTransaction(o, transactionId);
      if (t.match?.kind === "invoice") undoInvoiceMatch(o, t);
      if (t.match?.kind === "expense") {
        const e = state.expenses.find((x) => x.id === (t.match as { expenseId: Id }).expenseId);
        if (e) e.bankTransactionId = null;
      }
      t.match = null;
      return clone(t);
    },

    async connectDemoBank(session) {
      const o = owner(session);
      const existing = connectionOf(o);
      if (existing) return clone(existing);
      const c = demoConnection(o, ownerName(state, o), now());
      state.bankConnections.push(c);
      return clone(c);
    },

    async listAddons(session) {
      asAdmin(session);
      const order = { requested: 0, active: 1, off: 2 } as const;
      const therapists = state.therapists.map((t) => addonRow(t.id)).sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
      return { feeCents: state.booksAddonFeeCents, therapists };
    },

    async setAddon(session, therapistId, on) {
      asAdmin(session);
      if (!state.therapists.some((t) => t.id === therapistId) || typeof on !== "boolean") fail("not_found");
      const current = state.booksAddon[therapistId];
      if (on && current?.status !== "active") state.booksAddon[therapistId] = { status: "active", since: today(), termsAcceptedAt: null };
      if (!on) delete state.booksAddon[therapistId]; // the books stay (retention); only access and the fee stop
      return addonRow(therapistId);
    },

    async setAddonFee(session, feeCents) {
      asAdmin(session);
      if (!Number.isInteger(feeCents) || feeCents < 0 || feeCents > 100_000) fail("invalid", "Fill in a monthly amount");
      state.booksAddonFeeCents = feeCents;
      return feeCents;
    },

    async renewBankConsent(session) {
      const o = owner(session);
      const c = connectionOf(o);
      if (!c) fail("not_found");
      c!.consentUntil = addDays(today(), CONSENT_DAYS);
      c!.lastSyncAt = iso(now());
      return clone(c!);
    },
  };
}

function demoConnection(owner: Id | null, holder: string, atMs: number, consentUntil?: string): BankConnection {
  return {
    ownerTherapistId: owner,
    bankName: "Demo bank",
    iban: owner === null ? "NL00DEMO0123456789" : `NL00DEMO09876${String(owner.length).padStart(5, "0")}`,
    holder,
    connectedAt: iso(atMs),
    consentUntil: consentUntil ?? addDays(localDateOf(atMs), CONSENT_DAYS),
    lastSyncAt: iso(atMs),
    demo: true,
  };
}

// --------------------------------------------------------------------- seed --

/** Before the rent run is seeded, so last month's rent invoice carries Anna's add-on fee. */
export function seedBooksAddons(state: DemoState, refMs: number): void {
  const today = localDateOf(refMs);
  const [y, m] = today.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 3, 1));
  const since = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
  if (state.therapists.some((t) => t.id === "th-anna")) state.booksAddon["th-anna"] = { status: "active", since, termsAcceptedAt: `${since}T10:00:00.000Z` };
  // Someone else asked for it: the admin sees the request.
  if (state.therapists.some((t) => t.id === "th-bram")) state.booksAddon["th-bram"] = { status: "requested", since: addDays(today, -2), termsAcceptedAt: null };
}

interface SeedCost {
  key: string;
  supplier: string;
  description: string;
  category: CostCategory;
  grossCents: number;
  btwRate: BtwTreatment;
  /** Bank text; null = paid in cash (no bank payment). */
  bank: string | null;
}

/**
 * Pretend books for the centre and for Anna (add-on on), from the seed's reference time.
 * Older costs are fully sorted out; the last week leaves a few payments that "need a look",
 * each with a suggestion, so the demo shows the matching. Ids are stable (seed determinism).
 */
export function seedBooks(state: DemoState, refMs: number): void {
  const today = localDateOf(refMs);
  const lastWeek = addDays(today, -7);
  const thisMonth = `${today.slice(0, 8)}01`;
  const months = [-2, -1, 0].map((n) => {
    const [y, m] = thisMonth.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
  });
  const at = (day: string) => iso(Date.parse(`${day}T10:00:00Z`));

  function addCost(owner: Id | null, c: SeedCost, date: string, opts: { receipt?: boolean; linkBank?: boolean } = {}) {
    if (date >= today) return;
    const e = makeExpense(owner, { date, supplier: c.supplier, description: c.description, category: c.category, grossCents: c.grossCents, btwRate: c.btwRate }, stableId(`expense:${owner ?? "centre"}:${c.key}:${date}`), at(date));
    if (opts.receipt !== false) {
      const rid = stableId(`receipt:${e.id}`);
      const euros = `EUR ${(c.grossCents / 100).toFixed(2)}`;
      state.receiptData[rid] = demoReceiptPdf([c.supplier, date, c.description, "", `Totaal  ${euros}`, c.btwRate === "exempt" ? "Geen btw" : `waarvan btw ${c.btwRate}%`]);
      e.receipt = { id: rid, fileName: safeFileName(`${c.supplier}-${date}`, "pdf"), mimeType: "application/pdf", bytes: state.receiptData[rid].length, uploadedAt: at(date) };
    }
    state.expenses.push(e);
    const bookedOn = addDays(date, 1);
    if (c.bank && bookedOn < today) {
      const t: BankTransaction = {
        id: stableId(`banktx:${e.id}`),
        ownerTherapistId: owner,
        bookedOn,
        amountCents: -c.grossCents,
        counterparty: c.supplier,
        counterpartyIban: null,
        description: c.bank,
        match: null,
      };
      state.bankTransactions.push(t);
      // Older payments are sorted out already; the last week's still need a look (suggestion: this cost).
      if (opts.linkBank !== false && bookedOn < lastWeek) {
        e.bankTransactionId = t.id;
        t.match = { kind: "expense", expenseId: e.id };
      }
    }
    return e;
  }

  function addTx(owner: Id | null, key: string, t: Omit<BankTransaction, "id" | "ownerTherapistId" | "match"> & { match?: BankTransaction["match"] }) {
    if (t.bookedOn >= today) return;
    state.bankTransactions.push({ id: stableId(`banktx:${owner ?? "centre"}:${key}`), ownerTherapistId: owner, ...t, match: t.match ?? null });
  }

  // ---- the centre ----
  state.bankConnections.push(demoConnection(null, CENTRE_NAME, Date.parse(at(months[0])), addDays(months[0], CONSENT_DAYS)));
  const centreMonthly: Array<[number, SeedCost]> = [
    [2, { key: "bank", supplier: "Demo bank", description: "Kosten zakelijk betaalpakket", category: "bank_fees", grossCents: 920, btwRate: "exempt", bank: "Kosten betaalpakket" }],
    [5, { key: "energy", supplier: "Eneco", description: "Stroom en gas", category: "energy", grossCents: 18640, btwRate: "21", bank: "Termijnbedrag energie" }],
    [8, { key: "kpn", supplier: "KPN", description: "Internet en telefoon", category: "phone_internet", grossCents: 5495, btwRate: "21", bank: "KPN Zakelijk factuur" }],
    [12, { key: "clean", supplier: "Schoon & Fris Schoonmaak", description: "Schoonmaak praktijkruimtes", category: "cleaning", grossCents: 32000, btwRate: "21", bank: "Factuur schoonmaak" }],
    [15, { key: "insurance", supplier: "Interpolis", description: "Bedrijfsaansprakelijkheid", category: "insurance", grossCents: 4218, btwRate: "exempt", bank: "Premie verzekering" }],
    [20, { key: "google", supplier: "Google", description: "Google Workspace", category: "software", grossCents: 1380, btwRate: "21", bank: "Google Workspace" }],
  ];
  for (const month of months) {
    for (const [day, c] of centreMonthly) addCost(null, c, `${month.slice(0, 8)}${String(day).padStart(2, "0")}`, { receipt: c.category !== "bank_fees" });
  }
  addCost(null, { key: "ikea", supplier: "IKEA", description: "Kast voor de wachtkamer", category: "equipment", grossCents: 14900, btwRate: "21", bank: "IKEA Delft" }, `${months[0].slice(0, 8)}17`);
  addCost(null, { key: "flyers", supplier: "Vistaprint", description: "Flyers open dag", category: "marketing", grossCents: 8712, btwRate: "21", bank: "Vistaprint bestelling" }, `${months[1].slice(0, 8)}09`);
  addCost(null, { key: "tea", supplier: "Albert Heijn", description: "Thee en koffie voor de wachtkamer", category: "supplies", grossCents: 1876, btwRate: "9", bank: "AH to go" }, `${months[1].slice(0, 8)}22`);
  // Paid in cash and the receipt is still in a drawer: shows "receipt missing".
  addCost(null, { key: "candles", supplier: "Action", description: "Kaarsen en tissues", category: "supplies", grossCents: 2345, btwRate: "21", bank: null }, addDays(today, -5), { receipt: false });
  // A bank payment with no cost yet: suggestion "add as a cost" (supplies).
  addTx(null, "bol", { bookedOn: addDays(today, -3), amountCents: -6499, counterparty: "bol.com", counterpartyIban: null, description: "Bestelling 4021 diffuser" });
  // Somebody paid for a workshop evening: no invoice, the owner says "other income".
  addTx(null, "workshop", { bookedOn: addDays(today, -4), amountCents: 4500, counterparty: "P. de Wit", counterpartyIban: null, description: "Zaalhuur workshopavond" });
  // Room rent that came in: paid invoices are matched; Bram's open one arrives now (suggestion).
  for (const inv of state.invoices.filter((i) => i.kind === "room_rent" && i.status === "issued")) {
    if (inv.paidOn) {
      addTx(null, `rent:${inv.id}`, {
        bookedOn: inv.paidOn,
        amountCents: inv.totalCents,
        counterparty: inv.buyer.name,
        counterpartyIban: null,
        description: `Huur ${inv.number}`,
        match: { kind: "invoice", invoiceId: inv.id, balancePaymentId: null },
      });
    } else {
      addTx(null, `rent:${inv.id}`, { bookedOn: addDays(today, -2), amountCents: amountDue(inv), counterparty: inv.buyer.name, counterpartyIban: null, description: `Factuur ${inv.number} kamerhuur`, match: null });
    }
  }

  // ---- Anna: bookkeeping add-on on ----
  const anna = "th-anna";
  if (!state.therapists.some((t) => t.id === anna)) return;
  const annaName = ownerName(state, anna);
  state.bankConnections.push(demoConnection(anna, annaName, Date.parse(at(months[0])), addDays(months[0], CONSENT_DAYS)));
  const annaMonthly: Array<[number, SeedCost]> = [
    [3, { key: "insurance", supplier: "Nationale Nederlanden", description: "Beroepsaansprakelijkheid", category: "insurance", grossCents: 2850, btwRate: "exempt", bank: "Premie BAV" }],
    [6, { key: "phone", supplier: "Odido", description: "Telefoon zakelijk", category: "phone_internet", grossCents: 2500, btwRate: "21", bank: "Odido abonnement" }],
    [14, { key: "oil", supplier: "Natuurwinkel De Linde", description: "Massageolie en etherische olie", category: "supplies", grossCents: 3890, btwRate: "21", bank: "Natuurwinkel De Linde" }],
    [18, { key: "ns", supplier: "NS", description: "Treinreizen naar de praktijk", category: "travel", grossCents: 1260, btwRate: "9", bank: "NS Groep reizen" }],
  ];
  for (const month of months) {
    for (const [day, c] of annaMonthly) addCost(anna, c, `${month.slice(0, 8)}${String(day).padStart(2, "0")}`);
  }
  addCost(anna, { key: "course", supplier: "Academie voor Natuurgeneeskunde", description: "Nascholing voetreflex", category: "training", grossCents: 19500, btwRate: "21", bank: "Cursusgeld nascholing" }, `${months[1].slice(0, 8)}10`);
  // Her room rent from the centre is a cost for her (the invoice is the receipt).
  // One cost per BTW rate on the invoice (the rent without BTW, the add-on fee with 21%), paid in one transfer.
  for (const inv of state.invoices.filter((i) => i.kind === "room_rent" && i.status === "issued" && i.buyerTherapistId === anna && i.paidOn)) {
    const costs = btwByRate(inv.lines).map((r) => {
      const fee = r.treatment !== "exempt";
      return addCost(
        anna,
        {
          key: `rent:${inv.id}:${r.treatment}`,
          supplier: CENTRE_NAME,
          description: `${fee ? "Boekhoudmodule" : "Kamerhuur"} ${inv.number}`,
          category: fee ? "software" : "rent",
          grossCents: r.netCents + r.btwCents,
          btwRate: r.treatment,
          bank: null,
        },
        addDays(inv.paidOn!, -1),
      );
    });
    const main = costs.find((e) => e?.category === "rent") ?? costs[0];
    if (main) {
      const id = stableId(`banktx:${anna}:rentpay:${inv.id}`);
      main.bankTransactionId = id;
      addTx(anna, `rentpay:${inv.id}`, { bookedOn: inv.paidOn!, amountCents: -inv.totalCents, counterparty: CENTRE_NAME, counterpartyIban: null, description: `Huur ${inv.number}`, match: { kind: "expense", expenseId: main.id } });
    }
  }

  // Weekly payouts of online deposits: already counted on the deposit invoices.
  for (let w = 1; w <= 8; w++) {
    const day = addDays(today, -7 * w + 2);
    addTx(anna, `payout:${w}`, { bookedOn: day, amountCents: 4500 * (2 + (w % 3)), counterparty: "Stichting Mollie Payments", counterpartyIban: null, description: `Uitbetaling ${day}`, match: day < lastWeek ? { kind: "counted" } : null });
  }
  // A client paid an open final invoice by bank transfer: suggestion "this invoice".
  const open = state.invoices.find((i) => i.sellerTherapistId === anna && i.kind === "final" && i.status === "issued" && amountDue(i) > 0);
  if (open) addTx(anna, `client:${open.id}`, { bookedOn: addDays(today, -1), amountCents: amountDue(open), counterparty: open.buyer.name, counterpartyIban: null, description: `Betaling factuur ${open.number}`, match: null });
}
