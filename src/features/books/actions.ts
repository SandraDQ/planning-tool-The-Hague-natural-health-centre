"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { RECEIPT_MAX_BYTES, sniffReceipt } from "@/lib/books/receipt-file";
import { DomainError } from "@/lib/domain/store";
import type { Id, Session } from "@/lib/domain/types";
import { getStore } from "@/lib/server/data";
import type { BankMatchInput, ExpenseInput } from "@/lib/server/extensions";
import { getSession } from "@/lib/server/session";
import { run } from "@/features/dashboard/actions/run";

/** The books belong to the admin (the centre) or a therapist; everybody else goes to the login page. */
async function owner(): Promise<{ session: Session; store: ReturnType<typeof getStore> }> {
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "therapist")) {
    redirect({ href: "/login", locale: await getLocale() });
  }
  return { session: session!, store: getStore() };
}

function done(session: Session) {
  revalidatePath(session?.role === "admin" ? "/[locale]/admin" : "/[locale]/therapist", "layout");
}

/** The cost fields and an optional receipt file arrive as one form, so saving is one step. */
async function readForm(form: FormData): Promise<{ input: ExpenseInput & { id?: Id }; file: { name: string; data: Uint8Array } | null }> {
  const input = JSON.parse(String(form.get("data") ?? "{}")) as ExpenseInput & { id?: Id };
  const raw = form.get("receipt");
  if (!(raw instanceof File) || raw.size === 0) return { input, file: null };
  if (raw.size > RECEIPT_MAX_BYTES) throw new DomainError("invalid", "The file is too big (at most 5 MB)");
  const data = new Uint8Array(await raw.arrayBuffer());
  if (!sniffReceipt(data)) throw new DomainError("invalid", "Use a photo (JPG, PNG) or a PDF");
  return { input, file: { name: raw.name, data } };
}

export async function saveCost(form: FormData) {
  const { session, store } = await owner();
  const result = await run(async () => {
    const { input, file } = await readForm(form);
    const saved = await store.books.saveExpense(session, input);
    return file ? store.books.attachReceipt(session, saved.id, file) : saved;
  });
  done(session);
  return result;
}

/** A bank payment becomes a new cost (with its receipt, if one was added). */
export async function addCostFromPayment(transactionId: Id, form: FormData) {
  const { session, store } = await owner();
  const result = await run(async () => {
    const { input, file } = await readForm(form);
    const t = await store.books.matchTransaction(session, transactionId, { kind: "new_expense", expense: input });
    if (file && t.match?.kind === "expense") await store.books.attachReceipt(session, t.match.expenseId, file);
    return t;
  });
  done(session);
  return result;
}

export async function deleteCost(expenseId: Id) {
  const { session, store } = await owner();
  const result = await run(async () => {
    await store.books.deleteExpense(session, expenseId);
    return null;
  });
  done(session);
  return result;
}

export async function removeReceipt(expenseId: Id) {
  const { session, store } = await owner();
  const result = await run(() => store.books.removeReceipt(session, expenseId));
  done(session);
  return result;
}

export async function matchPayment(transactionId: Id, match: Exclude<BankMatchInput, { kind: "new_expense" }>) {
  const { session, store } = await owner();
  const result = await run(() => store.books.matchTransaction(session, transactionId, match));
  done(session);
  return result;
}

export async function unmatchPayment(transactionId: Id) {
  const { session, store } = await owner();
  const result = await run(() => store.books.unmatchTransaction(session, transactionId));
  done(session);
  return result;
}

export async function connectBank() {
  const { session, store } = await owner();
  const result = await run(() => store.books.connectDemoBank(session));
  done(session);
  return result;
}

export async function renewBankConsent() {
  const { session, store } = await owner();
  const result = await run(() => store.books.renewBankConsent(session));
  done(session);
  return result;
}

export async function requestBooksAddon() {
  const { session, store } = await owner();
  const result = await run(() => store.books.requestAddon(session));
  done(session);
  return result;
}

export async function acceptBooksTerms() {
  const { session, store } = await owner();
  const result = await run(() => store.books.acceptTerms(session));
  done(session);
  return result;
}

export async function setBooksAddon(therapistId: Id, on: boolean) {
  const { session, store } = await owner();
  const result = await run(() => store.books.setAddon(session, therapistId, on));
  done(session);
  return result;
}

export async function setBooksAddonFee(feeCents: number) {
  const { session, store } = await owner();
  const result = await run(() => store.books.setAddonFee(session, feeCents));
  done(session);
  return result;
}
