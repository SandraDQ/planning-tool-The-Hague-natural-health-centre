import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EmptyState, ButtonLink, Icons } from "@/design-system";
import { redirect } from "@/i18n/navigation";
import { BookingLayout } from "@/features/booking/components/BookingLayout";
import { ServiceMenu } from "@/features/booking/components/ServiceMenu";
import { BookingUnavailable } from "@/features/booking/components/Unavailable";
import { asLocale, bookingMetadata, menuData, safeCatalog } from "@/features/booking/server/pages";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ by?: string; therapist?: string; therapy?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return bookingMetadata(asLocale((await params).locale));
}

/** Step 1: choose a treatment (by therapist or by therapy). Deep links: ?therapist=<slug>, ?therapy=<id>. */
export default async function BookPage({ params, searchParams }: Props) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const sp = await searchParams;
  if (sp.therapist) redirect({ href: `/book/therapist/${encodeURIComponent(sp.therapist)}`, locale });
  if (sp.therapy) redirect({ href: `/book/therapy/${encodeURIComponent(sp.therapy)}`, locale });

  const t = await getTranslations("booking.choose");
  const tu = await getTranslations("booking.unavailable");
  const catalog = await safeCatalog(locale);
  if (!catalog) return <BookingUnavailable />;
  const data = menuData(catalog, locale);

  return (
    <BookingLayout step="choose" back="/" title={t("title")} intro={t("intro")}>
      {data.entries.length === 0 ? (
        <EmptyState
          icon={<Icons.CalendarIcon />}
          title={t("emptyTitle")}
          description={t("emptyText")}
          action={<ButtonLink href="/contact">{tu("contact")}</ButtonLink>}
        />
      ) : (
        <ServiceMenu {...data} initialGrouping={sp.by === "therapy" ? "therapy" : "therapist"} />
      )}
    </BookingLayout>
  );
}
