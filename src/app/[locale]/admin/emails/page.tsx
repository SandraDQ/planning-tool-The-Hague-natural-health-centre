import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card } from "@/design-system";
import { listOutbox } from "@/lib/email/outbox";
import { emailStatus } from "@/lib/email/send";
import { getStore } from "@/lib/server/data";
import { requireRole } from "@/lib/server/session";
import { DashboardPage, PageHeading } from "@/features/dashboard/components/Page";
import { CentreInfoEditor, ExampleSender, OutboxList } from "@/features/email/AdminEmails";
import { Welcome } from "@/features/email/Welcome";

export const dynamic = "force-dynamic";

const PROVIDER = { brevo: "Brevo", resend: "Resend" } as const;

export default async function AdminEmailsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRole("admin", locale);
  const t = await getTranslations("email.admin");
  const settings = await getStore().email.getCentreSettings(session);
  const status = emailStatus();
  const provider = status.provider ? PROVIDER[status.provider] : null;
  const statusText = !provider
    ? t("statusOutbox")
    : status.demo
      ? status.demoRecipients.length
        ? t("statusDemo", { provider, list: status.demoRecipients.join(", ") })
        : t("statusDemoNone", { provider })
      : t("statusLive", { provider, from: status.from });

  return (
    <DashboardPage narrow>
      <PageHeading title={t("title")} description={t("lead")} />
      <Welcome title={t("welcomeTitle")} lines={[t("welcome1"), t("welcome2"), t("welcome3")]} />
      <div className="mt-6 flex flex-col gap-6">
        <Card as="section" aria-labelledby="status-title">
          <h2 id="status-title" className="text-lg">
            {t("statusTitle")}
          </h2>
          <p className="mt-2 text-base">{statusText}</p>
        </Card>
        <CentreInfoEditor settings={settings} />
        <ExampleSender defaultTo={status.demoRecipients[0] ?? ""} />
        <OutboxList entries={listOutbox()} />
      </div>
    </DashboardPage>
  );
}
