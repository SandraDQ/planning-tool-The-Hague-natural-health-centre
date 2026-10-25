import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ButtonLink, EmptyState, Icons } from "@/design-system";
import { BookingLayout } from "@/features/booking/components/BookingLayout";
import { ServiceMenu } from "@/features/booking/components/ServiceMenu";
import { BookingUnavailable } from "@/features/booking/components/Unavailable";
import { asLocale, bookingMetadata, menuData, safeCatalog } from "@/features/booking/server/pages";

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const l = asLocale(locale);
  const catalog = await safeCatalog(l);
  const therapist = catalog?.therapists.find((t) => t.slug === slug);
  const t = await getTranslations({ locale: l, namespace: "booking" });
  return bookingMetadata(l, therapist ? `${t("choose.therapistTitle", { name: therapist.displayName })} | The Hague Natural Health Centre` : undefined);
}

/** Step 1, deep-linked from a therapist's section on the site: only this therapist's treatments. */
export default async function BookTherapistPage({ params }: Props) {
  const { locale: raw, slug } = await params;
  const locale = asLocale(raw);
  setRequestLocale(locale);
  const t = await getTranslations("booking.choose");
  const catalog = await safeCatalog(locale);
  if (!catalog) return <BookingUnavailable />;
  const therapist = catalog.therapists.find((x) => x.slug === slug);

  if (!therapist) {
    return (
      <BookingLayout step="choose" back="/book" title={t("notFoundTitle")}>
        <EmptyState
          icon={<Icons.User />}
          title={t("notFoundTitle")}
          description={t("notFoundText")}
          action={<ButtonLink href="/book">{t("seeAll")}</ButtonLink>}
        />
      </BookingLayout>
    );
  }

  const data = menuData(catalog, locale, { therapistId: therapist.id });
  return (
    <BookingLayout step="choose" back="/book" title={t("therapistTitle", { name: therapist.displayName })} intro={t("intro")}>
      <ServiceMenu {...data} therapists={data.therapists.filter((x) => x.id === therapist.id)} allowRegroup={false} hideGroupHeader />
      <ButtonLink href="/book" variant="ghost" className="self-start">
        {t("seeAll")}
      </ButtonLink>
    </BookingLayout>
  );
}
