import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { ButtonLink, Header } from "@/design-system";
import { Link } from "@/i18n/navigation";

// Placeholder home until the real site is rebuilt in Phase 8. Links to the design previews.
export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <Placeholder />;
}

function Placeholder() {
  const t = useTranslations();
  const pages = [
    { href: "/design/home", label: t("design.mock.pages.home") },
    { href: "/design/choose-time", label: t("design.mock.pages.chooseTime") },
    { href: "/design/therapist-calendar", label: t("design.mock.pages.calendar") },
  ];
  return (
    <>
      <Header />
      <main className="mx-auto flex max-w-reading flex-col items-start gap-6 px-gutter py-16 sm:py-24">
        <h1 className="text-2xl font-semibold">{t("home.title")}</h1>
        <ButtonLink href="/design" size="lg">
          {t("design.mock.pages.showcase")}
        </ButtonLink>
        <ul className="flex flex-col">
          {pages.map((p) => (
            <li key={p.href}>
              <Link href={p.href} className="inline-flex min-h-11 items-center text-base text-accent underline-offset-4 hover:underline">
                {p.label}
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
