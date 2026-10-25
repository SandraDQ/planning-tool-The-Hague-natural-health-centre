import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ButtonLink, EmptyState, Icons } from "@/design-system";
import { BookingLayout } from "@/features/booking/components/BookingLayout";
import { ServiceMenu } from "@/features/booking/components/ServiceMenu";
import { BookingUnavailable } from "@/features/booking/components/Unavailable";
import { asLocale, bookingMetadata, menuData, safeCatalog } from "@/features/booking/server/pages";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const l = asLocale(locale);
  const catalog = await safeCatalog(l);
  const therapy = catalog?.therapies.find((t) => t.id === id);
  const t = await getTranslations({ locale: l, namespace: "booking" });
  return bookingMetadata(l, therapy ? `${t("choose.therapyTitle", { therapy: therapy.name[l] })} | The Hague Natural Health Centre` : undefined);
}

/** Step 1, deep-linked from a therapy page: every therapist who offers this therapy. */
export default async function BookTherapyPage({ params }: Props) {
  const { locale: raw, id } = await params;
  const locale = asLocale(raw);
  setRequestLocale(locale);
  const t = await getTranslations("booking.choose");
  const catalog = await safeCatalog(locale);
  if (!catalog) return <BookingUnavailable />;
  const therapy = catalog.therapies.find((x) => x.id === id);

  if (!therapy) {
    return (
      <BookingLayout step="choose" back="/book" title={t("notFoundTitle")}>
        <EmptyState
          icon={<Icons.CalendarIcon />}
          title={t("notFoundTitle")}
          description={t("notFoundText")}
          action={<ButtonLink href="/book">{t("seeAll")}</ButtonLink>}
        />
      </BookingLayout>
    );
  }

  const data = menuData(catalog, locale, { therapyId: therapy.id });
  return (
    <BookingLayout step="choose" back="/book" title={t("therapyTitle", { therapy: therapy.name[locale] })} intro={t("intro")}>
      <ServiceMenu {...data} initialGrouping="therapist" allowRegroup={false} />
      <ButtonLink href="/book" variant="ghost" className="self-start">
        {t("seeAll")}
      </ButtonLink>
    </BookingLayout>
  );
}
