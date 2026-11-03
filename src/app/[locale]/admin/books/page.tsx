import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/lib/domain/types";
import { BooksHomePage } from "@/features/books/pages";

/** Bookkeeping: this month's costs and income, with "Add a cost" as the one main action. */
export default async function AdminBooksPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ month?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <BooksHomePage area="admin" locale={locale as Locale} month={(await searchParams).month} />;
}
