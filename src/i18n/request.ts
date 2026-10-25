import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";
import { loadFeatureMessages } from "./feature-messages";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const base = (await import(`../../messages/${locale}.json`)).default;
  return {
    locale,
    timeZone: "Europe/Amsterdam",
    messages: { ...base, ...(await loadFeatureMessages(locale)) },
  };
});
