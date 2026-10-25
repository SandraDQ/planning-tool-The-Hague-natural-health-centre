import { getTranslations, setRequestLocale } from "next-intl/server";
import { Badge, Card, Icons } from "@/design-system";
import { Link } from "@/i18n/navigation";
import { getStore } from "@/lib/server/data";
import { requireRole } from "@/lib/server/session";
import { DashboardPage, PageHeading } from "@/features/dashboard/components/Page";

export default async function TherapistSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRole("therapist", locale);
  const t = await getTranslations("therapist.settings");
  const business = await getStore().therapist.getMyBusiness(session);

  const sections = [
    { href: "/therapist/settings/services", icon: <Icons.Leaf />, title: t("services"), text: t("servicesText") },
    { href: "/therapist/settings/availability", icon: <Icons.Clock />, title: t("availability"), text: t("availabilityText") },
    { href: "/therapist/settings/policy", icon: <Icons.Info />, title: t("policy"), text: t("policyText") },
    { href: "/therapist/settings/profile", icon: <Icons.User />, title: t("profile"), text: t("profileText") },
  ];

  const rows: [string, string | null][] = business
    ? [
        [t("business.legalName"), business.legalName],
        [t("business.tradeName"), business.tradeName],
        [t("business.address"), business.address],
        [t("business.kvk"), business.kvk],
        [t("business.btwNumber"), business.btwNumber],
        [t("business.kor"), business.kor ? t("business.yes") : t("business.no")],
      ]
    : [];

  return (
    <DashboardPage narrow>
      <PageHeading title={t("title")} description={t("lead")} />
      <Card padded={false} className="mt-6">
        <ul className="divide-y divide-border">
          {sections.map((s) => (
            <li key={s.href}>
              <Link href={s.href} className="flex min-h-18 items-center gap-4 px-4 py-3 transition-colors duration-150 hover:bg-surface-2 sm:px-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-strong dark:text-accent [&_svg]:size-5">
                  {s.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base">{s.title}</span>
                  <span className="block text-sm text-fg-muted">{s.text}</span>
                </span>
                <Icons.ChevronRight className="size-5 shrink-0 text-fg-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Card as="section" aria-labelledby="business-title" className="mt-6">
        <div className="flex items-start justify-between gap-3">
          <h2 id="business-title" className="text-lg">
            {t("business.title")}
          </h2>
          <Badge tone="neutral">{t("business.readOnly")}</Badge>
        </div>
        <p className="mt-1 text-sm text-fg-muted">{t("business.text")}</p>
        {business ? (
          <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt className="text-sm text-fg-muted">{label}</dt>
                <dd className="text-base whitespace-pre-line">{value || "—"}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-4 text-base">{t("business.missing")}</p>
        )}
      </Card>
    </DashboardPage>
  );
}
