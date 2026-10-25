"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, Notice } from "@/design-system";
import { cancelMyAppointment, type CancelState } from "../server/actions";

/** Cancel with a confirm step that says what happens to the deposit. */
export function CancelAppointment({ appointmentId, consequence }: { appointmentId: string; consequence: string }) {
  const t = useTranslations("booking.account");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<CancelState, FormData>(cancelMyAppointment, { status: "idle" });
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (state.status === "done") {
    return <Notice tone="success" role="status" title={t("cancelled")} />;
  }

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
      {(state.status === "error" || state.status === "unavailable") && (
        <Notice tone="danger" role="alert" title={t("cancelError")} />
      )}
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
