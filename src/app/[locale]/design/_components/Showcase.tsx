"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Card,
  Checkbox,
  DatePicker,
  EmptyState,
  Icons,
  Logo,
  ProgressSteps,
  RadioCardGroup,
  SegmentedControl,
  SiteFooter,
  SiteHeader,
  Select,
  Sheet,
  Textarea,
  TextField,
  ThemeToggle,
  TimeSlotPicker,
  Toast,
  useToast,
  type PickerDay,
} from "@/design-system";
import { MockNote } from "./MockNote";

const swatches = [
  { token: "canvas", className: "bg-canvas", hex: "#ffffff" },
  { token: "surface2", className: "bg-surface-2", hex: "#f4f3eb" },
  { token: "sand", className: "bg-sand", hex: "#e8e4d5" },
  { token: "fg", className: "bg-fg", hex: "#352f2b" },
  { token: "fgMuted", className: "bg-fg-muted", hex: "#6a5d57" },
  { token: "brown", className: "bg-brown", hex: "#857166" },
  { token: "borderStrong", className: "bg-border-strong", hex: "#9f8c82" },
  { token: "accent", className: "bg-accent", hex: "#486f55" },
  { token: "accentStrong", className: "bg-accent-strong", hex: "#3b5241" },
  { token: "sage", className: "bg-sage", hex: "#799382" },
  { token: "accentSoft", className: "bg-accent-soft", hex: "#dde7df" },
  { token: "success", className: "bg-success", hex: "#3b6b4a" },
  { token: "warning", className: "bg-warning", hex: "#7a5410" },
  { token: "danger", className: "bg-danger", hex: "#9c3a2e" },
] as const;

const week: PickerDay[] = [
  { date: "2026-11-02", available: true },
  { date: "2026-11-03", available: true },
  { date: "2026-11-04", available: false },
  { date: "2026-11-05", available: true },
  { date: "2026-11-06", available: true },
  { date: "2026-11-07", available: true },
  { date: "2026-11-08", available: false },
];

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-5 border-t border-border pt-10">
      <div>
        <h2 className="text-xl">{title}</h2>
        {note && <p className="mt-2 max-w-reading text-base text-fg-muted">{note}</p>}
      </div>
      {children}
    </section>
  );
}

export function Showcase() {
  const t = useTranslations("design.showcase");
  const tm = useTranslations("design.mock.pages");
  const tSteps = useTranslations("design.chooseTime.steps");
  const tTime = useTranslations("design.chooseTime");
  const toast = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [day, setDay] = useState<string>("2026-11-03");
  const [slot, setSlot] = useState<string | null>("10:30");
  const [view, setView] = useState<"day" | "week">("day");
  const [session, setSession] = useState("first");

  const steps = [tSteps("therapist"), tSteps("session"), tSteps("time"), tSteps("details"), tSteps("pay")];

  return (
    <>
      <SiteHeader homeHref="/design/home" bookHref="/design/choose-time" />
      <main className="mx-auto flex max-w-content flex-col gap-10 px-gutter pt-10 pb-16 sm:pt-14">
        <div className="flex flex-col gap-4">
          <h1 className="text-2xl">{t("title")}</h1>
          <p className="max-w-reading text-lg text-fg-muted">{t("intro")}</p>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-fg-muted">{t("themeNote")}</span>
            <ThemeToggle />
          </div>
        </div>

        <Card className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg">{t("mockupsTitle")}</h2>
            <p className="mt-1 text-base text-fg-muted">{t("mockupsText")}</p>
          </div>
          <ul className="grid gap-2 sm:grid-cols-3">
            {[
              { href: "/design/home", label: tm("home") },
              { href: "/design/choose-time", label: tm("chooseTime") },
              { href: "/design/therapist-calendar", label: tm("calendar") },
            ].map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="flex min-h-13 items-center justify-between gap-2 rounded-sm bg-surface-2 px-4 text-base text-fg transition-colors duration-150 hover:bg-accent-soft"
                >
                  {l.label}
                  <Icons.ChevronRight className="size-5 text-fg-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Section title={t("logo")} note={t("logoNote")}>
          <div className="flex flex-wrap items-end gap-8">
            <Logo variant="mark" height={44} />
            <Logo variant="mark" height={72} />
            <div className="bg-sand p-4">
              <Logo variant="full" height={151} />
            </div>
          </div>
        </Section>

        <Section title={t("colours")} note={t("coloursNote")}>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {swatches.map((s) => (
              <li key={s.token} className="flex flex-col gap-2">
                <span className={`h-16 rounded-sm border border-border ${s.className}`} />
                <span className="text-sm">
                  {t(`tokens.${s.token}`)} <span className="block font-mono text-fg-muted">{s.hex}</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title={t("type")} note={t("typeNote")}>
          <div className="flex flex-col gap-4">
            <p className="font-display text-2xl font-extralight tracking-[0.04em] text-accent uppercase">{t("typeDisplay")}</p>
            <p className="font-heading text-2xl tracking-[0.05em] uppercase">{t("typeHero")}</p>
            <p className="font-heading text-xl">{t("typeTitle")}</p>
            <p className="font-heading text-lg">{t("typeHeading")}</p>
            <p className="text-base">{t("typeBody")}</p>
            <p className="text-sm text-fg-muted">{t("typeSmall")}</p>
            <p className="text-sm text-fg-muted">{t("typeFonts")}</p>
          </div>
        </Section>

        <Section title={t("buttons")} note={t("buttonsNote")}>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg">{t("primary")}</Button>
            <Button variant="secondary">{t("secondary")}</Button>
            <Button variant="ghost" leadingIcon={<Icons.ChevronLeft />}>
              {t("ghost")}
            </Button>
            <Button variant="secondary" disabled>
              {t("disabled")}
            </Button>
          </div>
        </Section>

        <Section title={t("forms")}>
          <div className="grid gap-5 md:grid-cols-2">
            <TextField label={t("firstName")} autoComplete="given-name" defaultValue="Anna" />
            <TextField label={t("email")} type="email" autoComplete="email" hint={t("emailHint")} placeholder="naam@voorbeeld.nl" />
            <TextField label={t("phone")} type="tel" autoComplete="tel" error={t("phoneError")} />
            <TextField label={t("birthDate")} type="date" optional />
            <Select
              label={t("therapy")}
              placeholder={t("therapyPlaceholder")}
              defaultValue=""
              options={[
                { value: "acupuncture", label: "Acupunctuur / Acupuncture" },
                { value: "massage", label: "Massage" },
                { value: "homeopathy", label: "Homeopathie / Homeopathy" },
              ]}
            />
            <Textarea label={t("reason")} placeholder={t("reasonPlaceholder")} />
          </div>
        </Section>

        <Section title={t("choices")}>
          <div className="grid gap-8 md:grid-cols-2">
            <RadioCardGroup
              legend={t("sessionLegend")}
              name="session"
              value={session}
              onChange={setSession}
              options={[
                { value: "first", title: t("session1"), description: t("session1Text"), meta: "€ 85" },
                { value: "follow", title: t("session2"), description: t("session2Text"), meta: "€ 70" },
                { value: "short", title: t("session3"), description: t("session3Text"), meta: "€ 45" },
              ]}
            />
            <div className="flex flex-col gap-1">
              <Checkbox label={t("policy")} description={t("policyText")} defaultChecked />
              <Checkbox label={t("health")} description={t("healthText")} />
              <div className="mt-4">
                <SegmentedControl
                  label={t("segmented")}
                  value={view}
                  onChange={setView}
                  segments={[
                    { value: "day", label: t("segmentedDay") },
                    { value: "week", label: t("segmentedWeek") },
                  ]}
                />
              </div>
            </div>
          </div>
        </Section>

        <Section title={t("cards")}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card>
              <h3 className="text-lg">{t("cardTitle")}</h3>
              <p className="mt-2 text-base text-fg-muted">{t("cardText")}</p>
            </Card>
            <Card as="a" href="#" interactive className="flex items-center gap-4">
              <Avatar name="Sophie de Vries" />
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold">Sophie de Vries</p>
                <p className="text-sm text-fg-muted">{t("cardTitle")}</p>
              </div>
              <Icons.ChevronRight className="size-5 text-fg-muted" />
            </Card>
          </div>
        </Section>

        <Section title={t("badges")}>
          <div className="flex flex-wrap gap-2">
            <Badge tone="success" icon={<Icons.Check />}>
              {t("badgeConfirmed")}
            </Badge>
            <Badge tone="warning">{t("badgeHeld")}</Badge>
            <Badge tone="accent">{t("badgePaid")}</Badge>
            <Badge tone="neutral">{t("badgeDue")}</Badge>
            <Badge tone="danger">{t("badgeCancelled")}</Badge>
            <Badge tone="accent">{t("badgeNew")}</Badge>
          </div>
        </Section>

        <Section title={t("progress")}>
          <ProgressSteps steps={steps} current={2} />
        </Section>

        <Section title={t("pickers")}>
          <Card className="flex max-w-xl flex-col gap-6">
            <DatePicker days={week} selected={day} onSelect={setDay} onNextWeek={() => {}} previousDisabled />
            <TimeSlotPicker
              slots={day === "2026-11-02" ? [] : ["09:00", "09:15", "10:30", "11:00", "13:30", "14:00", "15:45", "18:00"]}
              selected={slot}
              onSelect={setSlot}
              emptyAction={
                <Button variant="secondary" onClick={() => setDay("2026-11-03")}>
                  {tTime("nextFree")}
                </Button>
              }
            />
            {slot && <p className="text-sm text-fg-muted">{t("pickedTime", { time: slot })}</p>}
          </Card>
        </Section>

        <Section title={t("feedback")}>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => setSheetOpen(true)}>
              {t("openSheet")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => toast.show({ title: t("toastTitle"), description: t("toastText"), tone: "success" })}
            >
              {t("showToast")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => toast.show({ title: t("errorTitle"), description: t("errorText"), tone: "danger" })}
            >
              {t("showErrorToast")}
            </Button>
          </div>
          <div className="grid max-w-xl gap-3">
            <Toast title={t("toastTitle")} description={t("toastText")} tone="success" />
            <Toast title={t("errorTitle")} description={t("errorText")} tone="danger" />
          </div>
          <Sheet
            open={sheetOpen}
            onClose={() => setSheetOpen(false)}
            title={t("sheetTitle")}
            description={t("sheetText")}
            footer={
              <>
                <Button variant="ghost" onClick={() => setSheetOpen(false)}>
                  {t("sheetCancel")}
                </Button>
                <Button onClick={() => setSheetOpen(false)}>{t("sheetConfirm")}</Button>
              </>
            }
          >
            <TimeSlotPicker slots={["09:00", "09:45", "11:15", "14:00", "16:30"]} selected={slot} onSelect={setSlot} />
          </Sheet>
        </Section>

        <Section title={t("empty")}>
          <Card padded={false} className="max-w-xl">
            <EmptyState
              icon={<Icons.CalendarIcon />}
              title={t("emptyTitle")}
              description={t("emptyText")}
              action={<ButtonLink href="/design" variant="secondary" leadingIcon={<Icons.Plus />}>{t("emptyAction")}</ButtonLink>}
            />
          </Card>
        </Section>
      </main>
      <MockNote />
      <SiteFooter />
    </>
  );
}
