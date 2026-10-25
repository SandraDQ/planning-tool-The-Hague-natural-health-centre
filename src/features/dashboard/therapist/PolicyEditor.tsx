"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, Card, Checkbox, Select, TextField, Textarea } from "@/design-system";
import type { CancellationPolicy, Therapist } from "@/lib/domain/types";
import { savePolicy, updateProfile } from "../actions/therapist";
import { centsToInput, formatEuro, parseEuroInput } from "../money";
import { useRunAction } from "../useRunAction";

type Policy = Omit<CancellationPolicy, "therapistId">;

const DEFAULT_POLICY: Policy = {
  noticeValue: 24,
  noticeUnit: "hours",
  feeType: "percent",
  feeValue: 100,
  exemptNewClients: false,
  text: { nl: "", en: "" },
};

export function PolicyEditor({ policy, me }: { policy: CancellationPolicy | null; me: Therapist }) {
  return (
    <div className="mt-6 flex flex-col gap-6">
      <PolicyCard policy={policy ? { ...policy } : DEFAULT_POLICY} isNew={!policy} />
      <MessagesCard me={me} />
    </div>
  );
}

function PolicyCard({ policy, isNew }: { policy: Policy; isNew: boolean }) {
  const t = useTranslations("therapist.policy");
  const locale = useLocale();
  const { pending, exec } = useRunAction("therapist");
  const [value, setValue] = useState(policy);
  const [fee, setFee] = useState(policy.feeType === "fixed" ? centsToInput(policy.feeValue) : String(policy.feeValue));
  const feeValue =
    value.feeType === "fixed" ? parseEuroInput(fee) : /^\d{1,3}$/.test(fee.trim()) && Number(fee) <= 100 ? Number(fee) : null;
  const noticeOk = Number.isInteger(value.noticeValue) && value.noticeValue >= 0 && value.noticeValue <= 720;

  const summary =
    feeValue == null || !noticeOk
      ? null
      : t("summary", {
          notice: t(`notice.${value.noticeUnit}`, { count: value.noticeValue }),
          fee: value.feeType === "fixed" ? formatEuro(feeValue, locale) : `${feeValue}%`,
        });

  return (
    <Card as="section" aria-labelledby="policy-title">
      <h2 id="policy-title" className="text-lg">
        {t("title")}
      </h2>
      <p className="mt-1 text-sm text-fg-muted">{isNew ? t("textNew") : t("text")}</p>
      <form
        className="mt-5 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (feeValue == null || !noticeOk) return;
          exec(() => savePolicy({ ...value, feeValue }), { success: t("saved") });
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label={t("noticeValue")}
            type="number"
            inputMode="numeric"
            min={0}
            value={Number.isNaN(value.noticeValue) ? "" : value.noticeValue}
            onChange={(e) => setValue({ ...value, noticeValue: e.target.valueAsNumber })}
            error={!noticeOk ? t("noticeError") : undefined}
          />
          <Select
            label={t("noticeUnit")}
            value={value.noticeUnit}
            onChange={(e) => setValue({ ...value, noticeUnit: e.target.value as Policy["noticeUnit"] })}
            options={[
              { value: "hours", label: t("hours") },
              { value: "business_days", label: t("businessDays") },
            ]}
          />
          <Select
            label={t("feeType")}
            value={value.feeType}
            onChange={(e) => {
              const feeType = e.target.value as Policy["feeType"];
              setValue({ ...value, feeType });
              setFee(feeType === "fixed" ? "25.00" : "100");
            }}
            options={[
              { value: "percent", label: t("feePercent") },
              { value: "fixed", label: t("feeFixed") },
            ]}
          />
          <TextField
            label={value.feeType === "fixed" ? t("feeAmount") : t("feePercentage")}
            inputMode="decimal"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            error={feeValue == null ? t("feeError") : undefined}
          />
        </div>
        <Checkbox
          label={t("exemptNew")}
          description={t("exemptNewHint")}
          checked={value.exemptNewClients}
          onChange={(e) => setValue({ ...value, exemptNewClients: e.target.checked })}
        />
        {summary && <p className="rounded-md bg-surface-2 p-4 text-sm">{summary}</p>}
        <Textarea
          label={t("textNl")}
          optional
          rows={3}
          value={value.text.nl}
          onChange={(e) => setValue({ ...value, text: { ...value.text, nl: e.target.value } })}
          hint={t("textHint")}
        />
        <Textarea
          label={t("textEn")}
          optional
          rows={3}
          value={value.text.en}
          onChange={(e) => setValue({ ...value, text: { ...value.text, en: e.target.value } })}
        />
        <div>
          <Button type="submit" disabled={pending || feeValue == null || !noticeOk}>
            {t("save")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function MessagesCard({ me }: { me: Therapist }) {
  const t = useTranslations("therapist.policy");
  const { pending, exec } = useRunAction("therapist");
  const [reminder, setReminder] = useState(me.reminderHours);
  const [retention, setRetention] = useState<number | null>(me.intakeRetentionDays);
  const reminderOptions = [...new Set([2, 4, 12, 24, 48, 72, me.reminderHours])].sort((a, b) => a - b);
  const retentionOptions = [...new Set([30, 90, 180, 365, 730, ...(me.intakeRetentionDays ? [me.intakeRetentionDays] : [])])].sort((a, b) => a - b);

  return (
    <Card as="section" aria-labelledby="messages-title">
      <h2 id="messages-title" className="text-lg">
        {t("remindersTitle")}
      </h2>
      <div className="mt-4 flex flex-col gap-4">
        <Select
          label={t("reminder")}
          value={String(reminder)}
          onChange={(e) => setReminder(Number(e.target.value))}
          options={reminderOptions.map((h) => ({ value: String(h), label: t("hoursBefore", { count: h }) }))}
          hint={t("reminderHint")}
        />
        <Select
          label={t("retention")}
          value={retention == null ? "manual" : String(retention)}
          onChange={(e) => setRetention(e.target.value === "manual" ? null : Number(e.target.value))}
          options={[
            ...retentionOptions.map((d) => ({ value: String(d), label: d % 365 === 0 ? t("years", { count: d / 365 }) : t("days", { count: d }) })),
            { value: "manual", label: t("untilDeleted") },
          ]}
          hint={t("retentionHint")}
        />
        <div>
          <Button
            disabled={pending}
            onClick={() => exec(() => updateProfile({ reminderHours: reminder, intakeRetentionDays: retention }), { success: t("saved") })}
          >
            {t("saveMessages")}
          </Button>
        </div>
      </div>
    </Card>
  );
}
