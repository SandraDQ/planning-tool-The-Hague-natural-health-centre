"use client";

import { useState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Badge, Button, Card, Icons, RadioCardGroup, Select, Sheet, TextField, dayToDate } from "@/design-system";
import type { RentPricingMode, RentRate, RentSettings, Room } from "@/lib/domain/types";
import { changeRentRate, saveRentSettings } from "../actions/admin";
import { centsToInput, formatEuro, parseEuroInput } from "../money";
import { rateOn } from "../rent";
import { useRunAction } from "../useRunAction";
import { roomTitle } from "../rooms";

type Editing = { roomId: string | null; current: RentRate | null; label: string };

export function RentManager({ rooms, rates, settings, today }: { rooms: Room[]; rates: RentRate[]; settings: RentSettings; today: string }) {
  const t = useTranslations("admin.rent");
  const [editing, setEditing] = useState<Editing | null>(null);
  const sorted = [...rooms].filter((r) => r.active).sort((a, b) => a.number - b.number);
  const defaultRate = rateOn(rates, null, today);

  return (
    <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <Card as="section" aria-labelledby="prices-title" padded={false} className="p-5 sm:p-6">
        <h2 id="prices-title" className="text-lg">
          {t("pricesTitle")}
        </h2>
        <p className="mt-1 text-sm text-fg-muted">{t("pricesText")}</p>

        <div className="mt-5 flex flex-col gap-2 rounded-md bg-surface-2 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-base">{t("defaultRate")}</p>
            <p className="text-sm text-fg-muted">{t("defaultRateText")}</p>
          </div>
          <div className="flex items-center gap-3">
            <RateSummary rate={defaultRate} />
            <Button variant="secondary" size="sm" onClick={() => setEditing({ roomId: null, current: defaultRate, label: t("defaultRate") })}>
              {t("change")}
            </Button>
          </div>
        </div>

        <ul className="mt-4 divide-y divide-border">
          {sorted.map((room) => {
            const current = rateOn(rates, room.id, today);
            const planned = rates
              .filter((r) => r.roomId === room.id && r.validFrom > today)
              .sort((a, b) => a.validFrom.localeCompare(b.validFrom));
            const label = roomTitle(room.number, room.name, t("roomNumber", { number: room.number }));
            return (
              <li key={room.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-base">{label}</p>
                  <p className="text-sm text-fg-muted">{t(`kind.${room.kind}`)}</p>
                  {planned.map((p) => (
                    <PlannedLine key={p.id} rate={p} />
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  {current ? (
                    <RateSummary rate={current} />
                  ) : (
                    <span className="text-sm text-fg-muted">{room.kind === "shared" ? t("usesDefault") : t("noPrice")}</span>
                  )}
                  <Button variant="secondary" size="sm" onClick={() => setEditing({ roomId: room.id, current, label })}>
                    {t("change")}
                    <span className="sr-only"> {label}</span>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <SettingsCard settings={settings} />

      {editing && <RateSheet editing={editing} today={today} onClose={() => setEditing(null)} />}
    </div>
  );
}

function RateSummary({ rate }: { rate: RentRate | null }) {
  const t = useTranslations("admin.rent");
  const locale = useLocale();
  if (!rate) return <span className="text-sm text-fg-muted">{t("noPrice")}</span>;
  return (
    <span className="text-right">
      <span className="block text-base tabular-nums">
        {formatEuro(rate.amountCents, locale)} <span className="text-sm text-fg-muted">{t(`per.${rate.pricingMode}`)}</span>
      </span>
      <span className="block text-sm text-fg-muted">{t(`btw.${rate.btwTreatment}`)}</span>
    </span>
  );
}

function PlannedLine({ rate }: { rate: RentRate }) {
  const t = useTranslations("admin.rent");
  const format = useFormatter();
  const locale = useLocale();
  return (
    <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
      <Badge tone="accent">{t("planned")}</Badge>
      {t("fromDate", { date: format.dateTime(dayToDate(rate.validFrom), { day: "numeric", month: "long", year: "numeric" }) })}:{" "}
      {formatEuro(rate.amountCents, locale)} {t(`per.${rate.pricingMode}`)}
    </p>
  );
}

function RateSheet({ editing, today, onClose }: { editing: Editing; today: string; onClose: () => void }) {
  const t = useTranslations("admin.rent");
  const { pending, exec } = useRunAction("admin");
  const isDefault = editing.roomId === null;
  const [mode, setMode] = useState<RentPricingMode>(isDefault ? "per_block" : (editing.current?.pricingMode ?? "per_block"));
  const [amount, setAmount] = useState(editing.current ? centsToInput(editing.current.amountCents) : "");
  const [btw, setBtw] = useState<RentRate["btwTreatment"]>(editing.current?.btwTreatment ?? "exempt");
  const [validFrom, setValidFrom] = useState(today.endsWith("-01") ? today : nextMonthFirst(today));
  const cents = parseEuroInput(amount);

  return (
    <Sheet
      open
      onClose={onClose}
      title={t("sheetTitle", { label: editing.label })}
      description={t("sheetText")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            disabled={pending || cents == null || !validFrom}
            onClick={() =>
              exec(() => changeRentRate({ roomId: editing.roomId, pricingMode: mode, amountCents: cents!, btwTreatment: btw, validFrom }), {
                success: t("saved"),
                onSuccess: onClose,
              })
            }
          >
            {t("save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        {!isDefault && (
          <RadioCardGroup
            legend={t("modeLabel")}
            name="mode"
            value={mode}
            onChange={(v) => setMode(v as RentPricingMode)}
            options={[
              { value: "fixed_monthly", title: t("mode.fixed_monthly"), description: t("mode.fixed_monthlyText") },
              { value: "per_block", title: t("mode.per_block"), description: t("mode.per_blockText") },
            ]}
          />
        )}
        <TextField
          label={mode === "fixed_monthly" ? t("amountMonthly") : t("amountBlock")}
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          hint={t("amountHint")}
          error={amount && cents == null ? t("amountError") : undefined}
        />
        <Select
          label={t("btwLabel")}
          value={btw}
          onChange={(e) => setBtw(e.target.value as RentRate["btwTreatment"])}
          options={(["exempt", "21", "9"] as const).map((v) => ({ value: v, label: t(`btw.${v}`) }))}
          hint={t("btwHint")}
        />
        <TextField label={t("validFrom")} type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} hint={t("validFromHint")} />
        <p className="flex items-start gap-2 text-sm text-fg-muted">
          <Icons.Info className="mt-0.5 size-4 shrink-0" />
          {t("historyNote")}
        </p>
      </div>
    </Sheet>
  );
}

function nextMonthFirst(day: string) {
  const [y, m] = day.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

function SettingsCard({ settings }: { settings: RentSettings }) {
  const t = useTranslations("admin.rent");
  const { pending, exec } = useRunAction("admin");
  const [value, setValue] = useState(settings);

  return (
    <Card as="section" aria-labelledby="invoicing-title" className="self-start">
      <h2 id="invoicing-title" className="text-lg">
        {t("invoicingTitle")}
      </h2>
      <p className="mt-1 text-sm text-fg-muted">{t("invoicingText")}</p>
      <form
        className="mt-5 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          exec(() => saveRentSettings(value), { success: t("settingsSaved") });
        }}
      >
        <Select
          label={t("billingDay")}
          value={String(value.billingDay)}
          onChange={(e) => setValue({ ...value, billingDay: Number(e.target.value) })}
          options={Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: t("dayOfMonth", { day: i + 1 }) }))}
          hint={t("billingDayHint")}
        />
        <Select
          label={t("paymentTerm")}
          value={String(value.paymentTermDays)}
          onChange={(e) => setValue({ ...value, paymentTermDays: Number(e.target.value) })}
          options={[7, 14, 21, 30].map((d) => ({ value: String(d), label: t("days", { count: d }) }))}
        />
        <RadioCardGroup
          legend={t("sending")}
          name="autoSend"
          value={value.autoSend ? "auto" : "review"}
          onChange={(v) => setValue({ ...value, autoSend: v === "auto" })}
          options={[
            { value: "review", title: t("review"), description: t("reviewText") },
            { value: "auto", title: t("auto"), description: t("autoText") },
          ]}
        />
        <div>
          <Button type="submit" disabled={pending}>
            {t("saveSettings")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
