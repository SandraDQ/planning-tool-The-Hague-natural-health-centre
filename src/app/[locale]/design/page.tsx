import { setRequestLocale } from "next-intl/server";
import { Showcase } from "./_components/Showcase";

export default async function DesignShowcasePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <Showcase />;
}
