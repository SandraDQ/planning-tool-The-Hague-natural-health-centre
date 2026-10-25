"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button, Card, Checkbox, Icons, Select, TextField, Textarea } from "@/design-system";
import type { AvailabilityRule, TimeOff } from "@/lib/domain/types";
import { addTimeOff, saveAvailability, updateProfile } from "../actions/therapist";
import { sessionsInBlock } from "../sessions";
import { addDays, localToIso } from "../time";
import { useRunAction } from "../useRunAction";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
// 2026-11-02 is a Monday: used only to get localised weekday names.
const weekdayDate = (wd: number) => new Date(Date.UTC(2026, 10, 1 + wd, 12));

type Row = { on: boolean; start: string; end: string };

export function AvailabilityEditor({
  rules,
  bufferMinutes,
  timeOff,
  hasPrivateRoom,
  today,
}: {
  rules: AvailabilityRule[];
  bufferMinutes: number;
  timeOff: TimeOff[];
  hasPrivateRoom: boolean;
  today: string;
}) {
  return (
    <div className="mt-6 flex flex-col gap-6">
      <HoursCard rules={rules} hasPrivateRoom={hasPrivateRoom} />
      <BufferCard bufferMinutes={bufferMinutes} />
      <TimeOffCard timeOff={timeOff} today={today} />
    </div>
  );
}

function HoursCard({ rules, hasPrivateRoom }: { rules: AvailabilityRule[]; hasPrivateRoom: boolean }) {
  const t = useTranslations("therapist.availability");
  const format = useFormatter();
  const { pending, exec } = useRunAction("therapist");
  const [rows, setRows] = useState<Record<number, Row>>(() =>
    Object.fromEntries(
      WEEKDAYS.map((wd) => {
        const r = rules.find((x) => x.weekday === wd);
        return [wd, r ? { on: true, start: r.startTime, end: r.endTime } : { on: false, start: "09:00", end: "17:00" }];
      }),
    ),
  );
  const extra = rules.length - new Set(rules.map((r) => r.weekday)).size;
  const invalid = WEEKDAYS.some((wd) => rows[wd].on && (!rows[wd].start || !rows[wd].end || rows[wd].end <= rows[wd].start));

  return (
    <Card as="section" aria-labelledby="hours-title">
      <h2 id="hours-title" className="text-lg">
        {t("hoursTitle")}
      </h2>
      <p className="mt-1 text-sm text-fg-muted">{hasPrivateRoom ? t("hoursPrivate") : t("hoursShared")}</p>
      <ul className="mt-4 divide-y divide-border">
        {WEEKDAYS.map((wd) => {
          const row = rows[wd];
          const label = format.dateTime(weekdayDate(wd), { weekday: "long" });
          const set = (patch: Partial<Row>) => setRows({ ...rows, [wd]: { ...row, ...patch } });
          return (
            <li key={wd} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2">
              <Checkbox className="w-40 capitalize" label={label} checked={row.on} onChange={(e) => set({ on: e.target.checked })} />
              {row.on ? (
                <div className="flex items-center gap-2">
                  <TextField
                    label={t("from")}
                    type="time"
                    step={900}
                    className="[&_label]:sr-only"
                    value={row.start}
                    onChange={(e) => set({ start: e.target.value })}
                  />
                  <span aria-hidden className="text-fg-muted">
                    –
                  </span>
                  <TextField
                    label={t("to")}
                    type="time"
                    step={900}
                    className="[&_label]:sr-only"
                    value={row.end}
                    onChange={(e) => set({ end: e.target.value })}
                    aria-invalid={row.end <= row.start ? true : undefined}
                  />
                </div>
              ) : (
                <span className="text-sm text-fg-muted">{t("off")}</span>
              )}
            </li>
          );
        })}
      </ul>
      {extra > 0 && <p className="mt-2 text-sm text-warning">{t("multipleNote")}</p>}
      {invalid && <p className="mt-2 text-sm font-medium text-danger">{t("timeError")}</p>}
      <Button
        className="mt-4"
        disabled={pending || invalid}
        onClick={() =>
          exec(
            () =>
              saveAvailability(
                WEEKDAYS.filter((wd) => rows[wd].on).map((wd) => ({ weekday: wd, startTime: rows[wd].start, endTime: rows[wd].end })),
              ),
            { success: t("saved") },
          )
        }
      >
        {t("saveHours")}
      </Button>
    </Card>
  );
}

function BufferCard({ bufferMinutes }: { bufferMinutes: number }) {
  const t = useTranslations("therapist.availability");
  const { pending, exec } = useRunAction("therapist");
  const [buffer, setBuffer] = useState(bufferMinutes);
  return (
    <Card as="section" aria-labelledby="buffer-title">
      <h2 id="buffer-title" className="text-lg">
        {t("bufferTitle")}
      </h2>
      <p className="mt-1 text-sm text-fg-muted">{t("bufferText")}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-end">
        <Select
          label={t("buffer")}
          value={String(buffer)}
          onChange={(e) => setBuffer(Number(e.target.value))}
          options={Array.from({ length: 13 }, (_, i) => i * 5).map((m) => ({ value: String(m), label: t("minutes", { count: m }) }))}
        />
        <p className="rounded-md bg-accent-soft p-3 text-sm text-accent-strong dark:text-accent" aria-live="polite">
          {t("bufferPreview", { count: sessionsInBlock(240, 60, buffer), buffer })}
        </p>
      </div>
      <Button className="mt-4" disabled={pending || buffer === bufferMinutes} onClick={() => exec(() => updateProfile({ bufferMinutes: buffer }), { success: t("saved") })}>
        {t("saveBuffer")}
      </Button>
    </Card>
  );
}

function TimeOffCard({ timeOff, today }: { timeOff: TimeOff[]; today: string }) {
  const t = useTranslations("therapist.availability");
  const format = useFormatter();
  const { pending, exec } = useRunAction("therapist");
  const [from, setFrom] = useState(addDays(today, 1));
  const [fromTime, setFromTime] = useState("00:00");
  const [to, setTo] = useState(addDays(today, 1));
  const [toTime, setToTime] = useState("23:59");
  const [note, setNote] = useState("");
  const start = from && fromTime ? localToIso(from, fromTime) : "";
  const end = to && toTime ? localToIso(to, toTime) : "";
  const invalid = !start || !end || end <= start;
  const upcoming = timeOff.filter((x) => x.period.end > new Date().toISOString()).sort((a, b) => a.period.start.localeCompare(b.period.start));
  const fmt = (iso: string) => format.dateTime(new Date(iso), { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <Card as="section" aria-labelledby="timeoff-title">
      <h2 id="timeoff-title" className="text-lg">
        {t("timeOffTitle")}
      </h2>
      <p className="mt-1 text-sm text-fg-muted">{t("timeOffText")}</p>
      {upcoming.length > 0 && (
        <ul className="mt-4 divide-y divide-border rounded-md border border-border">
          {upcoming.map((x) => (
            <li key={x.id} className="flex items-start gap-3 px-3 py-2 text-sm">
              <Icons.CalendarIcon className="mt-0.5 size-4 shrink-0 text-fg-muted" />
              <span>
                {fmt(x.period.start)} – {fmt(x.period.end)}
                {x.note && <span className="block text-fg-muted">{x.note}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <form
        className="mt-4 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (invalid) return;
          exec(() => addTimeOff({ start, end }, note.trim() || undefined), { success: t("timeOffSaved"), onSuccess: () => setNote("") });
        }}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_9rem] gap-3">
          <TextField label={t("fromDate")} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <TextField label={t("time")} type="time" value={fromTime} onChange={(e) => setFromTime(e.target.value)} />
          <TextField label={t("toDate")} type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          <TextField label={t("time")} type="time" value={toTime} onChange={(e) => setToTime(e.target.value)} />
        </div>
        {invalid && from && to && <p className="text-sm font-medium text-danger">{t("timeOffError")}</p>}
        <Textarea label={t("note")} optional rows={2} value={note} onChange={(e) => setNote(e.target.value)} hint={t("noteHint")} />
        <div>
          <Button type="submit" variant="secondary" disabled={pending || invalid}>
            {t("addTimeOff")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
