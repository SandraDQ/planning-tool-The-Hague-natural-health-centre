// Words printed on invoices and in invoice e-mails, in the invoice's language (1: NL + EN).
// Kept here (not in next-intl messages) because invoices are built by the data layer.

import type { BalancePayment, InvoiceKind, Locale } from "@/lib/domain/types";

const TZ = "Europe/Amsterdam";

export function euro(cents: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "nl" ? "nl-NL" : "en-GB", { style: "currency", currency: "EUR" }).format(cents / 100);
}

/** "1 november 2026" / "1 November 2026". Accepts a date (YYYY-MM-DD) or an ISO time. */
export function longDate(value: string, locale: Locale): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-NL" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: TZ }).format(d);
}

export function dateTime(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-NL" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: TZ,
  }).format(new Date(value));
}

export function monthName(firstDay: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-NL" : "en-GB", { month: "long", year: "numeric", timeZone: TZ }).format(new Date(`${firstDay}T12:00:00Z`));
}

const METHOD: Record<Locale, Record<BalancePayment["method"], string>> = {
  nl: { cash: "contant", pin: "pin", transfer: "bankoverschrijving", tikkie: "Tikkie" },
  en: { cash: "cash", pin: "card (PIN)", transfer: "bank transfer", tikkie: "Tikkie" },
};

export const INVOICE_TEXT = {
  nl: {
    title: { deposit: "Factuur aanbetaling", final: "Factuur", credit_note: "Creditnota", room_rent: "Factuur kamerhuur" } satisfies Record<InvoiceKind, string>,
    number: "Factuurnummer",
    date: "Factuurdatum",
    due: "Te betalen vóór",
    to: "Aan",
    from: "Van",
    kvk: "KvK",
    btwNumber: "Btw-nummer",
    description: "Omschrijving",
    quantity: "Aantal",
    unit: "Prijs excl. btw",
    btw: "Btw",
    amount: "Bedrag excl. btw",
    subtotal: "Subtotaal excl. btw",
    btwLine: (rate: string) => `Btw ${rate}`,
    total: "Totaal",
    totalDue: "Nog te betalen",
    exempt: "vrijgesteld",
    exemptNote: (ground: string) => `Vrijgesteld van btw: ${ground}.`,
    korGround: "kleineondernemersregeling (KOR)",
    unknownGround: "vrijgestelde dienst (grond volgt na advies boekhouder)",
    rentGround: "vrijgestelde verhuur van onroerende zaken (art. 11 lid 1 sub b Wet OB)",
    deposit: (service: string, when: string) => `Aanbetaling ${service}, ${when}`,
    session: (service: string, when: string, minutes: number) => `${service}, ${when} (${minutes} min)`,
    lessDeposit: (number: string) => `Af: aanbetaling, factuur ${number}`,
    credit: (number: string) => `Terugbetaalde aanbetaling, factuur ${number}`,
    rentFixed: (room: number, month: string) => `Huur kamer ${room}, ${month}`,
    rentBlocks: (room: number) => `Kamer ${room}: gereserveerde dagdelen`,
    paidOnline: (amount: string, date: string) => `${amount} online betaald op ${date}. Dank u wel.`,
    balancePaid: (amount: string, method: BalancePayment["method"], date: string) => `${amount} betaald (${METHOD.nl[method]}) op ${date}.`,
    paidInFull: "Deze factuur is volledig betaald. Dank u wel.",
    payBy: (date: string) => `Graag betalen vóór ${date}.`,
    refunded: (amount: string) => `${amount} is teruggestort op uw rekening.`,
    rentPay: (date: string) => `Graag overmaken vóór ${date}, onder vermelding van het factuurnummer.`,
    demo: "Demo – testgegevens, geen echte factuur.",
  },
  en: {
    title: { deposit: "Deposit invoice", final: "Invoice", credit_note: "Credit note", room_rent: "Room rent invoice" } satisfies Record<InvoiceKind, string>,
    number: "Invoice number",
    date: "Invoice date",
    due: "Due date",
    to: "To",
    from: "From",
    kvk: "Chamber of Commerce (KvK)",
    btwNumber: "VAT number",
    description: "Description",
    quantity: "Qty",
    unit: "Price excl. VAT",
    btw: "VAT",
    amount: "Amount excl. VAT",
    subtotal: "Subtotal excl. VAT",
    btwLine: (rate: string) => `VAT ${rate}`,
    total: "Total",
    totalDue: "Still to pay",
    exempt: "exempt",
    exemptNote: (ground: string) => `Exempt from VAT: ${ground}.`,
    korGround: "small-business scheme (KOR)",
    unknownGround: "exempt service (ground to follow after the accountant's advice)",
    rentGround: "exempt letting of immovable property (art. 11(1)(b) Dutch VAT Act)",
    deposit: (service: string, when: string) => `Deposit ${service}, ${when}`,
    session: (service: string, when: string, minutes: number) => `${service}, ${when} (${minutes} min)`,
    lessDeposit: (number: string) => `Less: deposit, invoice ${number}`,
    credit: (number: string) => `Refunded deposit, invoice ${number}`,
    rentFixed: (room: number, month: string) => `Rent room ${room}, ${month}`,
    rentBlocks: (room: number) => `Room ${room}: reserved blocks`,
    paidOnline: (amount: string, date: string) => `${amount} paid online on ${date}. Thank you.`,
    balancePaid: (amount: string, method: BalancePayment["method"], date: string) => `${amount} paid (${METHOD.en[method]}) on ${date}.`,
    paidInFull: "This invoice has been paid in full. Thank you.",
    payBy: (date: string) => `Please pay by ${date}.`,
    refunded: (amount: string) => `${amount} has been refunded to your account.`,
    rentPay: (date: string) => `Please transfer by ${date}, quoting the invoice number.`,
    demo: "Demo – test data, not a real invoice.",
  },
} as const;

export function rateLabel(bp: number): string {
  return `${bp / 100}%`;
}
