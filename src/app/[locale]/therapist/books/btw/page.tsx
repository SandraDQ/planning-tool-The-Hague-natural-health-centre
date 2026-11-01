import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/lib/domain/types";
import { BooksBtwPage } from "@/features/books/pages";

/** The BTW quarter (for the accountant to check) and the download. */
export default async function TherapistBooksBtwPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ quarter?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <BooksBtwPage area="therapist" locale={locale as Locale} quarter={(await searchParams).quarter} />;
}
