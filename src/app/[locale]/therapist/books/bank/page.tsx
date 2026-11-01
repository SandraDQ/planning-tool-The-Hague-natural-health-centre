import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/lib/domain/types";
import { BooksBankPage } from "@/features/books/pages";

/** Bank payments: what needs a look (with a suggestion each) and what is sorted out. */
export default async function TherapistBooksBankPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <BooksBankPage area="therapist" locale={locale as Locale} />;
}
