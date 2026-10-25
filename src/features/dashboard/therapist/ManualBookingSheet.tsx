"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, Checkbox, Icons, Select, Sheet, TextField, TimeSlotPicker } from "@/design-system";
import type { Locale, Slot } from "@/lib/domain/types";
import { addManualBooking, manualSlots } from "../actions/therapist";
import { formatEuro } from "../money";
import { localToIso, localTime } from "../time";
import { useRunAction } from "../useRunAction";
import type { CalendarData } from "./calendar-data";

/** Add a phone / paper booking (3.5) at a valid time inside the therapist's own window. */
export function ManualBookingSheet({ data, initialDay, onClose }: { data: CalendarData; initialDay: string; onClose: () => void }) {
  const t = useTranslations("therapist.manual");
  const locale = useLocale() as Locale;
  const { pending, exec } = useRunAction("therapist");
  const [loading, startLoading] = useTransition();

  const services = data.services.filter((s) => !s.archived);
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const types = data.sessionTypes.filter((st) => st.serviceId === serviceId);
  const [sessionTypeId, setSessionTypeId] = useState(types[0]?.id ?? "");
  const sessionType = data.sessionTypes.find((st) => st.id === sessionTypeId);
  const [day, setDay] = useState(initialDay);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [time, setTime] = useState<string | null>(null);
  const [other, setOther] = useState(false);
  const [otherTime, setOtherTime] = useState("");
  const [client, setClient] = useState({ firstName: "", lastName: "", email: "", phone: "" });
  const [tried, setTried] = useState(false);

  useEffect(() => {
    setTime(null);
    if (!sessionTypeId || !day) return setSlots([]);
    startLoading(async () => {
      const r = await manualSlots(sessionTypeId, day);
      setSlots(r.ok ? r.data : []);
    });
  }, [sessionTypeId, day]);

  const times = useMemo(() => slots.map((s) => localTime(s.session.start)), [slots]);

  // "Another time": inside one of this day's own windows (D25: allowed in own time off, with a warning).
  const otherSlot = useMemo<Slot | null>(() => {
    if (!other || !otherTime || !sessionType) return null;
    const start = localToIso(day, otherTime);
    const end = new Date(Date.parse(start) + sessionType.durationMin * 60_000).toISOString();
    const occupiedEnd = Date.parse(end) + data.bufferMinutes * 60_000;
    const w = data.windows.find((x) => x.day === day && x.start <= start && Date.parse(x.end) >= occupiedEnd);
    if (!w) return null;
    return { therapistId: data.therapistId, roomId: w.roomId, roomBlockId: w.blockId, session: { start, end } };
  }, [other, otherTime, sessionType, day, data.windows, data.bufferMinutes, data.therapistId]);
  const inTimeOff =
    otherSlot != null && data.timeOff.some((p) => p.start < otherSlot.session.end && p.end > otherSlot.session.start);

  const chosen: Slot | null = other ? otherSlot : (slots.find((s) => localTime(s.session.start) === time) ?? null);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client.email.trim());
  const clientOk = client.firstName.trim() && client.lastName.trim() && emailOk && client.phone.trim();

  const submit = () => {
    setTried(true);
    if (!chosen || !clientOk || !sessionTypeId) return;
    exec(
      () =>
        addManualBooking({
          sessionTypeId,
          slot: chosen,
          client: {
            firstName: client.firstName.trim(),
            lastName: client.lastName.trim(),
            email: client.email.trim(),
            phone: client.phone.trim(),
            locale,
          },
        }),
      { success: t("saved"), successText: t("savedText"), onSuccess: onClose },
    );
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={t("title")}
      description={t("text")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button onClick={submit} disabled={pending}>
            {t("save")}
          </Button>
        </>
      }
    >
      {services.length === 0 ? (
        <p className="pb-4 text-base text-fg-muted">{t("noServices")}</p>
      ) : (
        <div className="flex flex-col gap-4 pb-2">
          <Select
            label={t("service")}
            value={serviceId}
            onChange={(e) => {
              setServiceId(e.target.value);
              setSessionTypeId(data.sessionTypes.find((st) => st.serviceId === e.target.value)?.id ?? "");
            }}
            options={services.map((s) => ({ value: s.id, label: s.name[locale] }))}
          />
          <Select
            label={t("sessionType")}
            value={sessionTypeId}
            onChange={(e) => setSessionTypeId(e.target.value)}
            options={types.map((st) => ({
              value: st.id,
              label: `${st.name[locale]} · ${t("minutes", { count: st.durationMin })} · ${formatEuro(st.priceCents, locale)}`,
            }))}
          />
          <TextField label={t("date")} type="date" value={day} onChange={(e) => setDay(e.target.value)} />

          {!other && (
            <div aria-busy={loading}>
              <p className="mb-2 text-sm font-medium">{t("time")}</p>
              {loading ? (
                <p className="text-sm text-fg-muted">{t("loading")}</p>
              ) : (
                <TimeSlotPicker slots={times} selected={time} onSelect={setTime} />
              )}
              {tried && !chosen && <p className="mt-2 text-sm font-medium text-danger">{t("timeError")}</p>}
            </div>
          )}
          <Checkbox label={t("other")} description={t("otherHint")} checked={other} onChange={(e) => setOther(e.target.checked)} />
          {other && (
            <div className="flex flex-col gap-2">
              <TextField
                label={t("otherTime")}
                type="time"
                step={300}
                value={otherTime}
                onChange={(e) => setOtherTime(e.target.value)}
                error={otherTime && !otherSlot ? t("outsideWindow") : tried && !otherTime ? t("timeError") : undefined}
              />
              {inTimeOff && (
                <p role="status" className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-sm text-warning">
                  <Icons.Alert className="mt-0.5 size-4 shrink-0" />
                  {t("timeOffWarning")}
                </p>
              )}
            </div>
          )}

          <fieldset className="flex flex-col gap-4 border-t border-border pt-4">
            <legend className="sr-only">{t("clientTitle")}</legend>
            <p className="font-heading text-lg">{t("clientTitle")}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label={t("firstName")}
                value={client.firstName}
                onChange={(e) => setClient({ ...client, firstName: e.target.value })}
                autoComplete="off"
                error={tried && !client.firstName.trim() ? t("firstNameError") : undefined}
              />
              <TextField
                label={t("lastName")}
                value={client.lastName}
                onChange={(e) => setClient({ ...client, lastName: e.target.value })}
                autoComplete="off"
                error={tried && !client.lastName.trim() ? t("lastNameError") : undefined}
              />
            </div>
            <TextField
              label={t("email")}
              type="email"
              inputMode="email"
              value={client.email}
              onChange={(e) => setClient({ ...client, email: e.target.value })}
              autoComplete="off"
              hint={t("emailHint")}
              error={tried && !emailOk ? t("emailError") : undefined}
            />
            <TextField
              label={t("phone")}
              type="tel"
              inputMode="tel"
              value={client.phone}
              onChange={(e) => setClient({ ...client, phone: e.target.value })}
              autoComplete="off"
              error={tried && !client.phone.trim() ? t("phoneError") : undefined}
            />
          </fieldset>
        </div>
      )}
    </Sheet>
  );
}
