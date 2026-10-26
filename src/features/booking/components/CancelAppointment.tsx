"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Button, Notice } from "@/design-system";
import { cancelOwnAppointment, type CancelResult } from "@/app/[locale]/account/actions";

/**
 * Cancel with a confirm step that says what happens to the deposit, then the
 * outcome with the refund the store actually made. Stays mounted after the
 * page re-renders with the appointment marked Cancelled, so the outcome stays visible.
 */
export function CancelAppointment({
  appointmentId,
  consequence,
  cancellable,
}: {
  appointmentId: string;
  consequence: string;
  /** False once the appointment is cancelled (then only the outcome, if any, shows). */
  cancellable: boolean;
}) {
  const t = useTranslations("booking.account");
  const locale = useLocale();
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<CancelResult, FormData>(cancelOwnAppointment, { status: "idle" });
  const panelRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);
  useEffect(() => {
    if (state.status === "done") doneRef.current?.focus();
  }, [state.status]);

  if (state.status === "done") {
    const euro = (cents: number) => format.number(cents / 100, { style: "currency", currency: "EUR" });
    return (
      <div ref={doneRef} tabIndex={-1} className="outline-none">
        <Notice tone="success" role="status" title={t("cancelled")}>
          {state.refundCents > 0
            ? state.feeCents > 0
              ? t("refundPartial", { refund: euro(state.refundCents), fee: euro(state.feeCents) })
              : t("refundFull", { refund: euro(state.refundCents) })
            : state.feeCents > 0
              ? t("refundNone", { fee: euro(state.feeCents) })
              : t("refundNothingPaid")}
        </Notice>
      </div>
    );
  }

  if (!cancellable) return null;

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="self-start">
        {t("cancel")}
      </Button>
    );
  }

  return (
    <div ref={panelRef} tabIndex={-1} role="group" aria-labelledby={`cancel-${appointmentId}`} className="flex flex-col gap-3 rounded-md bg-surface-2 p-4 outline-none">
      <p id={`cancel-${appointmentId}`} className="text-base font-bold">
        {t("cancelTitle")}
      </p>
      <p className="text-base">{consequence}</p>
      {state.status === "error" && <Notice tone="danger" role="alert" title={t("cancelError")} />}
      <form action={action} className="flex flex-col gap-2 sm:flex-row">
        <input type="hidden" name="id" value={appointmentId} />
        <input type="hidden" name="locale" value={locale} />
        <Button type="submit" variant="secondary" disabled={pending} aria-busy={pending}>
          {t("cancelConfirm")}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          {t("keep")}
        </Button>
      </form>
    </div>
  );
}
