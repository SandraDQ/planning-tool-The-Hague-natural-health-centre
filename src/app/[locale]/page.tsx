import { useTranslations } from "next-intl";

// Placeholder home; the design-system and site-rebuilder agents replace this.
export default function Home() {
  const t = useTranslations("home");
  return (
    <main>
      <h1>{t("title")}</h1>
    </main>
  );
}
