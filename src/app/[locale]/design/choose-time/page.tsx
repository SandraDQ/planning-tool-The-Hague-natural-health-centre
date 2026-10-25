import { setRequestLocale } from "next-intl/server";
import { ChooseTime } from "./ChooseTime";

export default async function ChooseTimeMockPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ChooseTime />;
}
