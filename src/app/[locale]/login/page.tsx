import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Badge, Button, ButtonLink, Card, DemoBanner, DisplayHeading, Icons, Logo, SiteSection } from "@/design-system";
import { getStore } from "@/lib/server/data";
import { listDemoAccounts, type DemoAccount } from "@/lib/server/demo";
import { resetDemoAction, signInAction, signOutAction } from "@/lib/server/auth-actions";
import { getSession, homeFor } from "@/lib/server/session";
import { SiteShell } from "../(site)/_components/SiteShell";
import { asLocale, pageMetadata } from "../(site)/_lib/metadata";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; reset?: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = asLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "auth.login" });
  return pageMetadata({ locale, path: "/login", title: t("metaTitle"), description: t("metaDescription"), noindex: true });
}

/** Demo sign-in (D22): choose to be the owner, a demo therapist or the demo client. */
export default async function LoginPage({ params, searchParams }: Props) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const { error, reset } = await searchParams;
  const t = await getTranslations("auth.login");
  const session = await getSession();
  const accounts = listDemoAccounts();
  const therapies = await getStore().public.listTherapies();
  const therapyName = new Map(therapies.map((th) => [th.id, th.name[locale]]));

  const admin = accounts.filter((a) => a.kind === "admin");
  const therapists = accounts.filter((a) => a.kind === "therapist");
  const clients = accounts.filter((a) => a.kind === "client");

  const signInForm = (account: DemoAccount, label: string) => (
    <form action={signInAction} className="mt-4">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="account" value={account.id} />
      <Button type="submit" variant={session?.userId === account.session.userId ? "primary" : "secondary"} fullWidth>
        {t("signInAs", { name: label })}
      </Button>
    </form>
  );

  return (
    <SiteShell>
      <DemoBanner />
      <SiteSection width="content" aria-labelledby="page-title" innerClassName="py-12 sm:py-16">
        <div className="flex flex-col items-center text-center">
          <Logo variant="mark" height={64} decorative />
          <DisplayHeading as="h1" id="page-title" className="mt-6">
            {t("title")}
          </DisplayHeading>
          <p className="mt-3 font-heading text-lg font-light text-accent-strong">{t("lead")}</p>
          <p className="mt-3 max-w-reading">{t("text")}</p>
        </div>

        <Card className="mx-auto mt-8 flex max-w-reading gap-3 bg-surface-2 text-fg-muted">
          <Icons.Info aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <p className="text-sm">{t("realLoginNote")}</p>
        </Card>

        {(error || reset) && (
          <p role="status" className="mx-auto mt-6 max-w-reading rounded-md bg-accent-soft px-4 py-3 text-center text-accent-strong">
            {error ? t("unknownAccount") : t("resetDone")}
          </p>
        )}

        {session && (
          <Card className="mx-auto mt-6 max-w-reading text-center">
            <p>{t("signedInAs", { name: session.displayName })}</p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <ButtonLink href={homeFor(session.role)}>{t("toDashboard")}</ButtonLink>
              <form action={signOutAction}>
                <input type="hidden" name="locale" value={locale} />
                <Button type="submit" variant="secondary" fullWidth leadingIcon={<Icons.LogOut aria-hidden="true" />}>
                  {t("signOut")}
                </Button>
              </form>
            </div>
          </Card>
        )}

        <section aria-labelledby="group-admin" className="mt-12">
          <h2 id="group-admin" className="text-lg">
            {t("groups.admin")}
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {admin.map((a) => (
              <Card key={a.id} className="flex flex-col">
                <p className="font-bold">{t("admin.name")}</p>
                <p className="mt-1 text-sm text-fg-muted">{t("admin.description")}</p>
                <div className="mt-auto">{signInForm(a, t("admin.name"))}</div>
              </Card>
            ))}
          </div>
        </section>

        <section aria-labelledby="group-therapists" className="mt-10">
          <h2 id="group-therapists" className="text-lg">
            {t("groups.therapists")}
          </h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {therapists.map((a) => (
              <li key={a.id}>
                <Card className="flex h-full flex-col">
                  <p className="font-bold">{a.session.displayName}</p>
                  <p className="mt-1 text-sm text-fg-muted">
                    {a.therapyIds
                      .map((id) => therapyName.get(id))
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge tone="neutral">
                      {a.roomNumbers.length ? t("therapist.rooms", { rooms: a.roomNumbers.join(", ") }) : t("therapist.noRooms")}
                    </Badge>
                    {a.paperCalendar && <Badge tone="accent">{t("therapist.paperCalendar")}</Badge>}
                    {a.onboarding === "invited" && <Badge tone="warning">{t("therapist.invited")}</Badge>}
                    {a.onboarding === "in_progress" && <Badge tone="warning">{t("therapist.inProgress")}</Badge>}
                  </div>
                  <div className="mt-auto">{signInForm(a, a.session.displayName)}</div>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="group-client" className="mt-10">
          <h2 id="group-client" className="text-lg">
            {t("groups.client")}
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {clients.map((a) => (
              <Card key={a.id} className="flex flex-col">
                <p className="font-bold">{a.session.displayName}</p>
                <p className="mt-1 text-sm text-fg-muted">{t("client.description")}</p>
                <div className="mt-auto">{signInForm(a, a.session.displayName)}</div>
              </Card>
            ))}
          </div>
        </section>

        {session?.role === "admin" && (
          <Card className="mt-12 bg-surface-2">
            <h2 className="text-lg">{t("reset.title")}</h2>
            <p className="mt-1 text-sm text-fg-muted">{t("reset.text")}</p>
            <form action={resetDemoAction} className="mt-4">
              <input type="hidden" name="locale" value={locale} />
              <Button type="submit" variant="ghost" leadingIcon={<Icons.Repeat aria-hidden="true" />}>
                {t("reset.button")}
              </Button>
            </form>
          </Card>
        )}
      </SiteSection>
    </SiteShell>
  );
}
