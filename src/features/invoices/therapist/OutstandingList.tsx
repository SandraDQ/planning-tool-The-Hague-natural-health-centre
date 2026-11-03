"use client";

import { useState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Button, Card, Icons, RadioCardGroup, Sheet, TextField, dayToDate, useToast } from "@/design-system";
import type { BalancePayment, Locale } from "@/lib/domain/types";
import { recordBalancePayment, sendFinalInvoice } from "@/features/dashboard/actions/therapist";
import { centsToInput, formatEuro, parseEuroInput } from "@/features/dashboard/money";
import { localDay, localTime } from "@/features/dashboard/time";
import { useRunAction } from "@/features/dashboard/useRunAction";
import { PdfLink } from "../components/InvoiceBits";

export type OutstandingRow = {
  appointmentId: string;
  start: string;
  end: string;
  clientName: string;
  hasEmail: boolean;
  service: string;
  priceCents: number;
  paidCents: number;
  dueCents: number;
  finalInvoice: { id: string; number: string; issuedAt: string; sentAt: string | null } | null;
};

const METHODS: BalancePayment["method"][] = ["pin", "cash", "transfer", "tikkie"];

/** "Who still has to pay": one card per session, with the two things a therapist does here. */
export function OutstandingList({ rows, today }: { rows: OutstandingRow[]; today: string }) {
  const t = useTranslations("invoices.therapist");
  const tc = useTranslations("invoices.common");
  const format = useFormatter();
  const locale = useLocale() as Locale;
  const [paying, setPaying] = useState<OutstandingRow | null>(null);
  const [sending, setSending] = useState<OutstandingRow | null>(null);

  const when = (r: OutstandingRow) =>
    `${format.dateTime(dayToDate(localDay(r.start)), { weekday: "long", day: "numeric", month: "long" })} · ${localTime(r.start)}`;

  return (
    <>
      <ul className="mt-3 flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.appointmentId}>
            <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-lg font-bold">{r.clientName}</p>
                <p className="text-base text-fg-muted first-letter:uppercase">{when(r)}</p>
                <p className="text-base text-fg-muted">{r.service}</p>
                <p className="mt-2 text-lg">
                  {t("stillToPay")}: <span className="font-bold tabular-nums">{formatEuro(r.dueCents, locale)}</span>
                  {r.paidCents > 0 && (
                    <span className="block text-sm text-fg-muted">
                      {t("price")} {formatEuro(r.priceCents, locale)} · {t("alreadyPaid")} {formatEuro(r.paidCents, locale)}
                    </span>
                  )}
                </p>
                {r.finalInvoice && (
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-fg-muted">
                    <Icons.Mail className="size-4" />
                    {t("invoiceAlreadySent", {
                      number: r.finalInvoice.number,
                      date: format.dateTime(new Date(r.finalInvoice.sentAt ?? r.finalInvoice.issuedAt), { day: "numeric", month: "long" }),
                    })}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                <Button onClick={() => setPaying(r)} leadingIcon={<Icons.Euro />}>
                  {t("paymentReceived")}
                </Button>
                {r.finalInvoice ? (
                  <PdfLink invoiceId={r.finalInvoice.id} label={tc("openPdf")} ariaLabel={tc("openPdfLabel", { number: r.finalInvoice.number })} />
                ) : (
                  <Button variant="secondary" size="sm" onClick={() => setSending(r)} leadingIcon={<Icons.Mail />}>
                    {t("sendInvoice")}
                  </Button>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>
      {paying && <PaySheet row={paying} today={today} onClose={() => setPaying(null)} />}
      {sending && <SendSheet row={sending} onClose={() => setSending(null)} />}
    </>
  );
}

function PaySheet({ row, today, onClose }: { row: OutstandingRow; today: string; onClose: () => void }) {
  const t = useTranslations("invoices.therapist");
  const { pending, exec } = useRunAction("therapist");
  const [method, setMethod] = useState<BalancePayment["method"]>("pin");
  const [amount, setAmount] = useState(centsToInput(row.dueCents));
  const [paidOn, setPaidOn] = useState(today);
  const cents = parseEuroInput(amount);
  return (
    <Sheet
      open
      onClose={onClose}
      title={t("payTitle")}
      description={row.clientName}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            disabled={pending || !cents || !paidOn}
            onClick={() =>
              exec(() => recordBalancePayment({ appointmentId: row.appointmentId, method, amountCents: cents!, paidOn }), {
                success: t("saved"),
                successText: t("savedText"),
                onSuccess: onClose,
              })
            }
          >
            {t("save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        <p className="text-lg">{t("payText", { name: row.clientName })}</p>
        <RadioCardGroup
          legend={t("method")}
          name="method"
          value={method}
          onChange={(v) => setMethod(v as BalancePayment["method"])}
          options={METHODS.map((m) => ({ value: m, title: t(`methods.${m}`) }))}
        />
        <TextField
          label={t("amount")}
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={amount && !cents ? t("amountError") : undefined}
        />
        <TextField label={t("paidOnLabel")} type="date" value={paidOn} max={today} onChange={(e) => setPaidOn(e.target.value)} />
        <p className="text-base text-fg-muted">{t("payNote")}</p>
      </div>
    </Sheet>
  );
}

function SendSheet({ row, onClose }: { row: OutstandingRow; onClose: () => void }) {
  const t = useTranslations("invoices.therapist");
  const locale = useLocale() as Locale;
  const toast = useToast();
  const { pending, exec } = useRunAction("therapist");
  return (
    <Sheet
      open
      onClose={onClose}
      title={t("sendConfirmTitle", { name: row.clientName })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            disabled={pending}
            leadingIcon={<Icons.Mail />}
            onClick={() =>
              exec(() => sendFinalInvoice(row.appointmentId), {
                onSuccess: () => {
                  toast.show({ title: t("invoiceSent"), description: row.hasEmail ? t("invoiceSentText") : t("invoiceSentNoEmail"), tone: "success" });
                  onClose();
                },
              })
            }
          >
            {t("sendConfirm")}
          </Button>
        </>
      }
    >
      <p className="pb-2 text-lg">{t("sendConfirmText", { name: row.clientName, amount: formatEuro(row.dueCents, locale) })}</p>
    </Sheet>
  );
}
