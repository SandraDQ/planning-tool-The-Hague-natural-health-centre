"use client";

import { useActionState, useEffect, useRef, useState, startTransition, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, Checkbox, Icons, Notice, RadioCardGroup, TextField, Textarea } from "@/design-system";
import { Link } from "@/i18n/navigation";
import { holdBooking, type HoldState } from "../server/actions";
import { LIMITS, emptyDetails, readDetails, validateDetails, type DetailsErrors, type DetailsField, type DetailsValues } from "../validation";
import { localDay } from "../time";

// Per-viewer convenience only: keeps typed details if the chosen time is taken
// and the client goes back to pick another. Never holds consent.
export const DRAFT_KEY = "thnhc.booking.details";
const DRAFT_FIELDS: DetailsField[] = ["firstName", "lastName", "email", "phone", "reason", "clientKind", "dateOfBirth", "address", "comments"];

function loadDraft(): Partial<DetailsValues> {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Partial<DetailsValues>) : {};
  } catch {
    return {};
  }
}

function saveDraft(v: DetailsValues) {
  try {
    const draft = Object.fromEntries(DRAFT_FIELDS.map((k) => [k, v[k]]));
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* storage unavailable: nothing to keep */
  }
}

/** Order in which errors are announced and focused. */
const ORDER: DetailsField[] = ["firstName", "lastName", "email", "phone", "reason", "clientKind", "dateOfBirth", "address", "comments", "acceptedPolicy", "healthDataConsent"];

export function DetailsForm({
  sessionTypeId,
  start,
  prefill,
  signedInName,
  therapistName,
  policyText,
}: {
  sessionTypeId: string;
  start: string;
  prefill: Partial<DetailsValues> | null;
  signedInName: string | null;
  therapistName: string;
  policyText: string | null;
}) {
  const t = useTranslations("booking.details");
  const locale = useLocale();
  const [state, dispatch, pending] = useActionState<HoldState, FormData>(holdBooking, { status: "idle" });
  const [values, setValues] = useState<DetailsValues>({ ...emptyDetails, ...(prefill ?? {}) });
  const [errors, setErrors] = useState<DetailsErrors>({});
  const [showSummary, setShowSummary] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const askClientKind = !signedInName;
  const optionalFilled = !!(values.dateOfBirth || values.address || values.comments);

  // Restore a draft (prefill from the account wins).
  useEffect(() => {
    const draft = loadDraft();
    if (Object.keys(draft).length === 0) return;
    setValues((v) => {
      const next = { ...v };
      for (const k of DRAFT_FIELDS) {
        const d = draft[k];
        if (typeof d === "string" && d && !(prefill && prefill[k])) (next as Record<string, unknown>)[k] = d;
      }
      return next;
    });
  }, [prefill]);

  // Server-side validation result.
  useEffect(() => {
    if (state.status === "invalid") {
      setErrors(state.errors);
      setShowSummary(true);
    }
    if (state.status === "error") summaryRef.current?.focus();
  }, [state]);

  useEffect(() => {
    if (showSummary) summaryRef.current?.focus();
  }, [showSummary, errors]);

  const set = <K extends DetailsField>(k: K, v: DetailsValues[K]) => {
    setValues((prev) => {
      const next = { ...prev, [k]: v };
      saveDraft(next);
      return next;
    });
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const found = validateDetails(readDetails(fd), { askClientKind, today: localDay(Date.now()) });
    const clean = Object.fromEntries(Object.entries(found).filter(([, v]) => v)) as DetailsErrors;
    setErrors(clean);
    if (Object.keys(clean).length > 0) {
      setShowSummary(true);
      return;
    }
    setShowSummary(false);
    startTransition(() => dispatch(fd));
  };

  const err = (k: DetailsField) => (errors[k] ? t(`errors.${errors[k]}`) : undefined);
  const firstError = ORDER.find((k) => errors[k]);

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <input type="hidden" name="st" value={sessionTypeId} />
      <input type="hidden" name="start" value={start} />
      <input type="hidden" name="locale" value={locale} />

      {state.status === "error" && (
        <Notice tone="danger" role="alert" title={t("genericError")} tabIndex={-1} />
      )}
      {showSummary && firstError && (
        <div ref={summaryRef} tabIndex={-1} className="outline-none">
          <Notice tone="danger" role="alert" title={t("errorSummary")}>
            <ul className="mt-1 list-disc pl-5">
              {ORDER.filter((k) => errors[k]).map((k) => (
                <li key={k}>
                  <a href={`#f-${k}`} className="underline underline-offset-4 hover:text-accent-strong">
                    {t(`errors.${errors[k]}`)}
                  </a>
                </li>
              ))}
            </ul>
          </Notice>
        </div>
      )}

      {signedInName && (
        <Notice tone="info" title={t("signedInAs", { name: signedInName })} />
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          id="f-firstName"
          name="firstName"
          label={t("firstName")}
          autoComplete="given-name"
          required
          maxLength={LIMITS.name}
          value={values.firstName}
          onChange={(e) => set("firstName", e.target.value)}
          error={err("firstName")}
        />
        <TextField
          id="f-lastName"
          name="lastName"
          label={t("lastName")}
          autoComplete="family-name"
          required
          maxLength={LIMITS.name}
          value={values.lastName}
          onChange={(e) => set("lastName", e.target.value)}
          error={err("lastName")}
        />
        <TextField
          id="f-email"
          name="email"
          type="email"
          inputMode="email"
          label={t("email")}
          hint={t("emailHint")}
          autoComplete="email"
          required
          maxLength={LIMITS.email}
          value={values.email}
          onChange={(e) => set("email", e.target.value)}
          error={err("email")}
        />
        <TextField
          id="f-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          label={t("phone")}
          hint={t("phoneHint")}
          autoComplete="tel"
          required
          maxLength={LIMITS.phone}
          value={values.phone}
          onChange={(e) => set("phone", e.target.value)}
          error={err("phone")}
        />
      </div>

      <Textarea
        id="f-reason"
        name="reason"
        label={t("reason")}
        placeholder={t("reasonPlaceholder")}
        required
        rows={3}
        maxLength={LIMITS.reason}
        value={values.reason}
        onChange={(e) => set("reason", e.target.value)}
        error={err("reason")}
      />

      {askClientKind && (
        <div id="f-clientKind" tabIndex={-1} className="outline-none">
          <RadioCardGroup
            legend={<span className="font-sans text-sm font-medium">{t("clientKind")}</span>}
            name="clientKind"
            value={values.clientKind}
            onChange={(v) => set("clientKind", v)}
            options={[
              { value: "new", title: t("clientNew") },
              { value: "returning", title: t("clientReturning") },
            ]}
          />
          {errors.clientKind && <p className="mt-2 text-sm font-medium text-danger">{t(`errors.${errors.clientKind}`)}</p>}
        </div>
      )}

      <details className="group rounded-md border border-border bg-surface" open={optionalFilled || !!errors.dateOfBirth || !!errors.address || !!errors.comments}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="block text-base font-bold">{t("more")}</span>
            <span className="block text-sm text-fg-muted">{t("moreHint")}</span>
          </span>
          <Icons.ChevronDown className="size-5 shrink-0 text-accent transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none" />
        </summary>
        <div className="flex flex-col gap-5 border-t border-border p-4">
          <TextField
            id="f-dateOfBirth"
            name="dateOfBirth"
            type="date"
            label={t("dateOfBirth")}
            optional
            autoComplete="bday"
            max={localDay(Date.now())}
            value={values.dateOfBirth}
            onChange={(e) => set("dateOfBirth", e.target.value)}
            error={err("dateOfBirth")}
          />
          <TextField
            id="f-address"
            name="address"
            label={t("address")}
            hint={t("addressHint")}
            optional
            autoComplete="street-address"
            maxLength={LIMITS.address}
            value={values.address}
            onChange={(e) => set("address", e.target.value)}
            error={err("address")}
          />
          <Textarea
            id="f-comments"
            name="comments"
            label={t("comments")}
            optional
            rows={3}
            maxLength={LIMITS.comments}
            value={values.comments}
            onChange={(e) => set("comments", e.target.value)}
            error={err("comments")}
          />
        </div>
      </details>

      <section aria-labelledby="policy-title" className="flex flex-col gap-3 rounded-md bg-surface-2 p-4 sm:p-5">
        <h2 id="policy-title" className="text-lg">
          {t("policyTitle")}
        </h2>
        <p className="text-base whitespace-pre-line">{policyText || t("policyNone")}</p>
        <Checkbox
          id="f-acceptedPolicy"
          name="acceptedPolicy"
          label={t("acceptPolicy", { name: therapistName })}
          checked={values.acceptedPolicy}
          onChange={(e) => set("acceptedPolicy", e.target.checked)}
          error={err("acceptedPolicy")}
          required
        />
        <Checkbox
          id="f-healthDataConsent"
          name="healthDataConsent"
          label={t("healthConsent")}
          description={
            <>
              {t("healthConsentHint")}{" "}
              <Link href="/privacy" className="text-accent underline underline-offset-4">
                {t("privacy")}
              </Link>
            </>
          }
          checked={values.healthDataConsent}
          onChange={(e) => set("healthDataConsent", e.target.checked)}
          error={err("healthDataConsent")}
          required
        />
      </section>

      <Button type="submit" size="lg" fullWidth disabled={pending} aria-busy={pending} className="sm:w-auto sm:self-start">
        {pending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
