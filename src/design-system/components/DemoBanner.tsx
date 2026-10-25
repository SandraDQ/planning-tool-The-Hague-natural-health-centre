import { useTranslations } from "next-intl";
import { Info } from "./icons";
import { cn } from "../utils";

/**
 * Thin band that marks a screen as demo (D21/D22): "Demo — test data, nothing is real".
 * Put it at the top of every platform screen (booking, dashboards, login) while demo mode is on.
 */
export function DemoBanner({ className }: { className?: string }) {
  const t = useTranslations("demo.banner");
  return (
    <div role="note" className={cn("bg-warning-soft text-warning", className)}>
      <p className="mx-auto flex max-w-site items-center justify-center gap-2 px-gutter py-2 text-center text-sm [&_svg]:size-4 [&_svg]:shrink-0">
        <Info aria-hidden="true" />
        <span>
          <strong className="font-bold">{t("label")}</strong> — {t("text")}
        </span>
      </p>
    </div>
  );
}
