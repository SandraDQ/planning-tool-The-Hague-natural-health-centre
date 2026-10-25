import { useFormatter, useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { Avatar, ButtonLink, Card, Header, Icons } from "@/design-system";
import { Link } from "@/i18n/navigation";
import { MockNote } from "../_components/MockNote";
import { PhotoPlaceholder } from "../_components/PhotoPlaceholder";

const therapies = ["acupuncture", "massage", "homeopathy", "psychology", "ayurveda", "nutrition"] as const;

// Made-up therapists for the mock-up only.
const therapists = [
  { name: "Sophie de Vries", therapy: "acupuncture", next: "2026-11-03T10:30:00+01:00" },
  { name: "Mark Jansen", therapy: "massage", next: "2026-11-02T14:00:00+01:00" },
  { name: "Elif Kaya", therapy: "psychology", next: "2026-11-05T09:00:00+01:00" },
  { name: "Daan Bakker", therapy: "homeopathy", next: "2026-11-04T16:15:00+01:00" },
] as const;

export default async function HomeMockPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <HomeMock />;
}

function HomeMock() {
  const t = useTranslations("design.home");
  const nav = [
    { href: "/design/home#therapies", label: t("nav.therapies") },
    { href: "/design/home#therapists", label: t("nav.therapists") },
    { href: "/design/home#about", label: t("nav.about") },
    { href: "/design/home#visit", label: t("nav.contact") },
  ];

  return (
    <>
      <Header nav={nav} homeHref="/design/home" />
      <main>
        {/* Hero: one message, one primary action */}
        <section className="mx-auto grid max-w-content items-center gap-10 px-gutter pt-12 pb-16 sm:pt-20 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:pb-24">
          <div className="flex flex-col items-start gap-6">
            <p className="text-sm font-medium text-fg-muted">{t("heroEyebrow")}</p>
            <h1 className="text-2xl font-semibold">{t("heroTitle")}</h1>
            <p className="max-w-reading text-lg text-fg-muted">{t("heroText")}</p>
            <div className="mt-2 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <ButtonLink href="/design/choose-time" size="lg">
                {t("book")}
              </ButtonLink>
              <ButtonLink href="/design/home#therapists" variant="ghost" size="lg">
                {t("meet")}
              </ButtonLink>
            </div>
          </div>
          <PhotoPlaceholder className="aspect-[4/3] w-full" />
        </section>

        {/* Therapies */}
        <section id="therapies" className="scroll-mt-20 bg-surface-2/60 py-16 sm:py-20">
          <div className="mx-auto max-w-content px-gutter">
            <div className="mb-8 flex flex-col gap-2">
              <h2 className="text-xl font-semibold">{t("therapiesTitle")}</h2>
              <p className="text-base text-fg-muted">{t("therapiesText")}</p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {therapies.map((key) => (
                <li key={key}>
                  <Card as={Link} href="/design/choose-time" interactive className="flex h-full items-center gap-4">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-semibold">{t(`therapies.${key}.name`)}</h3>
                      <p className="mt-1 text-base text-fg-muted">{t(`therapies.${key}.text`)}</p>
                    </div>
                    <Icons.ChevronRight className="size-5 shrink-0 text-fg-muted" />
                  </Card>
                </li>
              ))}
            </ul>
            <Link
              href="/design/home#therapies"
              className="mt-6 inline-flex min-h-11 items-center gap-1 rounded-sm text-base font-medium text-accent hover:underline"
            >
              {t("allTherapies")}
              <Icons.ChevronRight className="size-5" />
            </Link>
          </div>
        </section>

        {/* Therapists */}
        <section id="therapists" className="mx-auto max-w-content scroll-mt-20 px-gutter py-16 sm:py-20">
          <div className="mb-8 flex flex-col gap-2">
            <h2 className="text-xl font-semibold">{t("therapistsTitle")}</h2>
            <p className="text-base text-fg-muted">{t("therapistsText")}</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {therapists.map((p) => (
              <li key={p.name}>
                <TherapistCard name={p.name} therapy={t(`therapies.${p.therapy}.name`)} next={p.next} />
              </li>
            ))}
          </ul>
        </section>

        {/* How booking works */}
        <section id="about" className="border-y border-border bg-surface py-16 sm:py-20">
          <div className="mx-auto max-w-content px-gutter">
            <div className="mb-10 flex flex-col gap-2">
              <h2 className="text-xl font-semibold">{t("stepsTitle")}</h2>
              <p className="text-base text-fg-muted">{t("stepsText")}</p>
            </div>
            <ol className="grid gap-8 sm:grid-cols-3">
              {[t("step1"), t("step2"), t("step3")].map((step, i) => (
                <li key={step} className="flex gap-4 sm:flex-col">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-base font-semibold text-accent-strong dark:text-accent">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-lg font-semibold">{step}</p>
                    {i === 2 && <p className="mt-1 text-base text-fg-muted">{t("step3Text")}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Visit */}
        <section id="visit" className="mx-auto max-w-content scroll-mt-20 px-gutter py-16 sm:py-20">
          <Card className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div className="flex gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-muted">
                <Icons.MapPin className="size-6" />
              </span>
              <div>
                <h2 className="text-lg font-semibold">{t("visitTitle")}</h2>
                <p className="mt-1 text-base">{t("address")}</p>
                <p className="mt-1 text-base text-fg-muted">{t("visitText")}</p>
              </div>
            </div>
            <ButtonLink href="/design/home#visit" variant="secondary">
              {t("route")}
            </ButtonLink>
          </Card>
        </section>
      </main>
      <MockNote />
    </>
  );
}

function TherapistCard({ name, therapy, next }: { name: string; therapy: string; next: string }) {
  const t = useTranslations("design.home");
  const format = useFormatter();
  return (
    <Card as={Link} href="/design/choose-time" interactive className="flex items-center gap-4">
      <Avatar name={name} size="md" />
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold">{name}</p>
        <p className="text-sm text-fg-muted">{therapy}</p>
        <p className="mt-1 text-sm text-accent">{t("nextFree", { when: format.dateTime(new Date(next), { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) })}</p>
      </div>
      <Icons.ChevronRight className="size-5 shrink-0 text-fg-muted" />
    </Card>
  );
}
