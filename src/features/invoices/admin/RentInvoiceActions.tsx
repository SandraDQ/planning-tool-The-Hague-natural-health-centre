"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, Icons, Sheet, TextField, useToast } from "@/design-system";
import type { Locale } from "@/lib/domain/types";
import { prepareRentInvoices, sendRentInvoices, setRentInvoicePaid } from "@/features/dashboard/actions/admin";
import { formatEuro } from "@/features/dashboard/money";
import { useRunAction } from "@/features/dashboard/useRunAction";

/** Works out the month's rent invoices as drafts (nothing is sent). */
export function PrepareButton({ month, again }: { month: string; again?: boolean }) {
  const t = useTranslations("invoices.admin");
  const toast = useToast();
  const { pending, exec } = useRunAction("admin");
  return (
    <Button
      variant={again ? "secondary" : "primary"}
      size={again ? "sm" : "lg"}
      disabled={pending}
      leadingIcon={again ? <Icons.Repeat /> : <Icons.Euro />}
      onClick={() =>
        exec(() => prepareRentInvoices(month), {
          onSuccess: (drafts) =>
            drafts.length
              ? toast.show({ title: t("prepared"), description: t("preparedText"), tone: "success" })
              : toast.show({ title: t("nothingToBill"), tone: "neutral" }),
        })
      }
    >
      {again ? t("prepareAgain") : t("prepare")}
    </Button>
  );
}

/** Sends all checked drafts, after a confirmation (sent invoices cannot change). */
export function SendDraftsButton({ ids }: { ids: string[] }) {
  const t = useTranslations("invoices.admin");
  const { pending, exec } = useRunAction("admin");
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <Button size="lg" leadingIcon={<Icons.Mail />} onClick={() => setConfirm(true)}>
        {t("send", { count: ids.length })}
      </Button>
      {confirm && (
        <Sheet
          open
          onClose={() => setConfirm(false)}
          title={t("sendConfirmTitle")}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirm(false)}>
                {t("cancel")}
              </Button>
              <Button
                disabled={pending}
                leadingIcon={<Icons.Mail />}
                onClick={() => exec(() => sendRentInvoices(ids), { success: t("sent"), successText: t("sentText"), onSuccess: () => setConfirm(false) })}
              >
                {t("sendConfirm")}
              </Button>
            </>
          }
        >
          <p className="pb-2 text-lg">{t("sendConfirmText", { count: ids.length })}</p>
        </Sheet>
      )}
    </>
  );
}

/** "Mark as paid" (asks the date) or, when paid, "Not paid after all". */
export function MarkPaid({ invoiceId, paid, name, totalCents, today }: { invoiceId: string; paid: boolean; name: string; totalCents: number; today: string }) {
  const t = useTranslations("invoices.admin");
  const locale = useLocale() as Locale;
  const { pending, exec } = useRunAction("admin");
  const [open, setOpen] = useState(false);
  const [paidOn, setPaidOn] = useState(today);
  if (paid) {
    return (
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => exec(() => setRentInvoicePaid(invoiceId, null), { success: t("unpaidSaved") })}>
        {t("markUnpaid")}
      </Button>
    );
  }
  return (
    <>
      <Button size="sm" leadingIcon={<Icons.Check />} onClick={() => setOpen(true)}>
        {t("markPaid")}
      </Button>
      {open && (
        <Sheet
          open
          onClose={() => setOpen(false)}
          title={t("payTitle")}
          description={name}
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                {t("cancel")}
              </Button>
              <Button
                disabled={pending || !paidOn}
                onClick={() => exec(() => setRentInvoicePaid(invoiceId, paidOn), { success: t("paidSaved"), onSuccess: () => setOpen(false) })}
              >
                {t("savePaid")}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4 pb-2">
            <p className="text-lg">{t("payText", { name, amount: formatEuro(totalCents, locale) })}</p>
            <TextField label={t("paidOnLabel")} type="date" value={paidOn} max={today} onChange={(e) => setPaidOn(e.target.value)} />
          </div>
        </Sheet>
      )}
    </>
  );
}
