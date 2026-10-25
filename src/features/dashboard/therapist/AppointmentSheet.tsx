"use client";

import { useState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Badge, Button, Icons, Select, Sheet, TextField, dayToDate } from "@/design-system";
import type { BalancePayment, Locale } from "@/lib/domain/types";
import { cancelAppointment, markNoShow, recordBalancePayment } from "../actions/therapist";
import { centsToInput, formatEuro, parseEuroInput } from "../money";
import { localDay, localTime } from "../time";
import { useRunAction } from "../useRunAction";
import type { CalendarAppointment } from "./calendar-data";

type Mode = "details" | "pay" | "cancel" | "noshow";
const METHODS: BalancePayment["method"][] = ["pin", "cash", "transfer", "tikkie"];

/** Appointment details with the therapist's actions (7): cancel, no-show, record balance payment. */
export function AppointmentSheet({ appointment: a, today, onClose }: { appointment: CalendarAppointment; today: string; onClose: () => void }) {
  const t = useTranslations("therapist.appointment");
  const format = useFormatter();
  const locale = useLocale() as Locale;
  const { pending, exec } = useRunAction("therapist");
  const [mode, setMode] = useState<Mode>("details");
  const balance = Math.max(0, a.snapshot.priceCents - a.snapshot.depositCents);
  const [method, setMethod] = useState<BalancePayment["method"]>("pin");
  const [amount, setAmount] = useState(centsToInput(balance));
  const [paidOn, setPaidOn] = useState(today);
  const cents = parseEuroInput(amount);

  const day = localDay(a.session.start);
  const name = a.client ? `${a.client.firstName} ${a.client.lastName}`.trim() : t("unknownClient");
  const started = Date.parse(a.session.start) <= Date.now();
  const canAct = a.status === "confirmed";

  const footer =
    mode === "details" ? (
      canAct ? (
        <>
          <Button variant="ghost" onClick={() => setMode("cancel")}>
            {t("cancelAppointment")}
          </Button>
          <Button variant="secondary" onClick={() => setMode("noshow")}>
            {t("noShow")}
          </Button>
          <Button onClick={() => setMode("pay")} leadingIcon={<Icons.Euro />}>
            {t("recordPayment")}
          </Button>
        </>
      ) : a.status === "no_show" || a.status === "completed" ? (
        <Button onClick={() => setMode("pay")} leadingIcon={<Icons.Euro />}>
          {t("recordPayment")}
        </Button>
      ) : (
        <Button variant="ghost" onClick={onClose}>
          {t("close")}
        </Button>
      )
    ) : mode === "pay" ? (
      <>
        <Button variant="ghost" onClick={() => setMode("details")}>
          {t("back")}
        </Button>
        <Button
          disabled={pending || !cents || !paidOn}
          onClick={() =>
            exec(() => recordBalancePayment({ appointmentId: a.id, method, amountCents: cents!, paidOn }), {
              success: t("paymentSaved"),
              successText: t("paymentSavedText"),
              onSuccess: onClose,
            })
          }
        >
          {t("savePayment")}
        </Button>
      </>
    ) : mode === "cancel" ? (
      <>
        <Button variant="ghost" onClick={() => setMode("details")}>
          {t("keep")}
        </Button>
        <Button
          disabled={pending}
          className="bg-danger hover:bg-danger"
          onClick={() => exec(() => cancelAppointment(a.id), { success: t("cancelled"), successText: t("cancelledText"), onSuccess: onClose })}
        >
          {t("confirmCancel")}
        </Button>
      </>
    ) : (
      <>
        <Button variant="ghost" onClick={() => setMode("details")}>
          {t("back")}
        </Button>
        <Button disabled={pending} onClick={() => exec(() => markNoShow(a.id), { success: t("noShowSaved"), onSuccess: onClose })}>
          {t("confirmNoShow")}
        </Button>
      </>
    );

  return (
    <Sheet
      open
      onClose={onClose}
      title={mode === "pay" ? t("payTitle") : mode === "cancel" ? t("cancelTitle") : mode === "noshow" ? t("noShowTitle") : name}
      description={`${format.dateTime(dayToDate(day), { weekday: "long", day: "numeric", month: "long" })} · ${localTime(a.session.start)}–${localTime(a.session.end)}`}
      footer={footer}
    >
      {mode === "details" && (
        <div className="flex flex-col gap-5 pb-2">
          <div className="flex flex-wrap gap-2">
            <Badge tone={a.status === "confirmed" ? "success" : a.status === "held" ? "warning" : a.status === "cancelled" ? "danger" : "neutral"}>
              {t(`status.${a.status}`)}
            </Badge>
            <Badge tone="neutral">{a.source === "manual" ? t("sourceManual") : t("sourceOnline")}</Badge>
            {a.roomNumber != null && <Badge tone="accent">{t("room", { number: a.roomNumber })}</Badge>}
          </div>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-base">
            <dt className="text-fg-muted">{t("service")}</dt>
            <dd>
              {a.snapshot.serviceName[locale]}
              <span className="block text-sm text-fg-muted">
                {a.snapshot.sessionTypeName[locale]} · {t("minutes", { count: a.snapshot.durationMin })}
              </span>
            </dd>
            {a.client?.email && (
              <>
                <dt className="text-fg-muted">{t("email")}</dt>
                <dd className="truncate">
                  <a href={`mailto:${a.client.email}`} className="text-accent underline-offset-4 hover:underline">
                    {a.client.email}
                  </a>
                </dd>
              </>
            )}
            {a.client?.phone && (
              <>
                <dt className="text-fg-muted">{t("phone")}</dt>
                <dd>
                  <a href={`tel:${a.client.phone.replace(/\s/g, "")}`} className="text-accent underline-offset-4 hover:underline">
                    {a.client.phone}
                  </a>
                </dd>
              </>
            )}
          </dl>
          <div className="grid grid-cols-3 gap-2 rounded-md bg-surface-2 p-4 text-center">
            <Money label={t("price")} cents={a.snapshot.priceCents} locale={locale} />
            <Money label={t("deposit")} cents={a.snapshot.depositCents} locale={locale} />
            <Money label={t("balance")} cents={balance} locale={locale} />
          </div>
          {a.status === "held" && <p className="text-sm text-fg-muted">{t("heldText")}</p>}
          {canAct && !started && <p className="text-sm text-fg-muted">{t("balanceHint")}</p>}
          <p className="flex items-start gap-2 text-sm text-fg-muted">
            <Icons.Info className="mt-0.5 size-4 shrink-0" />
            {t("intakeNote")}
          </p>
        </div>
      )}

      {mode === "pay" && (
        <div className="flex flex-col gap-4 pb-2">
          <p className="text-base">{t("payText", { name, amount: formatEuro(balance, locale) })}</p>
          <Select
            label={t("method")}
            value={method}
            onChange={(e) => setMethod(e.target.value as BalancePayment["method"])}
            options={METHODS.map((m) => ({ value: m, label: t(`methods.${m}`) }))}
          />
          <TextField
            label={t("amount")}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            error={amount && !cents ? t("amountError") : undefined}
          />
          <TextField label={t("paidOn")} type="date" value={paidOn} max={today} onChange={(e) => setPaidOn(e.target.value)} />
          <p className="text-sm text-fg-muted">{t("invoiceNote")}</p>
        </div>
      )}

      {mode === "cancel" && (
        <div className="flex flex-col gap-3 pb-2">
          <p className="text-base">{t("cancelText", { name })}</p>
          <p className="rounded-md bg-surface-2 p-4 text-sm">
            {t("refundText", { amount: formatEuro(a.snapshot.depositCents, locale) })}
          </p>
        </div>
      )}

      {mode === "noshow" && (
        <div className="flex flex-col gap-3 pb-2">
          <p className="text-base">{t("noShowText", { name })}</p>
          {!started && <p className="rounded-md bg-warning-soft p-3 text-sm text-warning">{t("noShowEarly")}</p>}
        </div>
      )}
    </Sheet>
  );
}

function Money({ label, cents, locale }: { label: string; cents: number; locale: string }) {
  return (
    <div>
      <p className="text-sm text-fg-muted">{label}</p>
      <p className="text-base tabular-nums">{formatEuro(cents, locale)}</p>
    </div>
  );
}
