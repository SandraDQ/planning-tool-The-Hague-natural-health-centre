import { getTranslations } from "next-intl/server";
import { Badge, ButtonLink, Card, Icons, cn, siteContact } from "@/design-system";
import type { SetupStep } from "./setup";

/**
 * The therapist's setup steps (8B) as one calm list: what each step is for, whether it's
 * done, and one big button to do it. Large text for older users (D30).
 */
export async function SetupChecklist({ steps, done, total }: { steps: SetupStep[]; done: number; total: number }) {
  const t = await getTranslations("setup");
  const allDone = done === total;
  return (
    <div className="flex flex-col gap-6">
      <Card as="section" aria-labelledby="setup-progress">
        <p id="setup-progress" className="text-xl">
          {allDone ? t("allDone") : t("progress", { done, total })}
        </p>
        <div
          className="mt-3 h-3 w-full overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          aria-label={t("progressLabel")}
        >
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round((done / total) * 100)}%` }} />
        </div>
        <p className="mt-3 text-lg">{allDone ? t("allDoneText") : t("progressText")}</p>
      </Card>

      <ol className="flex flex-col gap-4">
        {steps.map((s, i) => (
          <li key={s.id}>
            <Card className={cn("flex flex-col gap-3", s.done && "bg-surface-2")}>
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-full text-lg font-bold",
                    s.done ? "bg-accent text-on-accent" : "border-2 border-accent text-accent",
                  )}
                >
                  {s.done ? <Icons.Check className="size-5" /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold">{t(`steps.${s.id}.title`)}</h2>
                  <p className="mt-1 text-lg">{t(`steps.${s.id}.text`)}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {s.done && <Badge tone="success">{t("done")}</Badge>}
                    {s.later && <Badge tone="neutral">{t("later")}</Badge>}
                    {!s.done && !s.later && s.essential && <Badge tone="warning">{t("needed")}</Badge>}
                    {!s.done && !s.later && !s.essential && <Badge tone="neutral">{t("optional")}</Badge>}
                  </div>
                </div>
              </div>
              {s.href && (
                <ButtonLink href={s.href} size="lg" variant={s.done ? "secondary" : "primary"} className="sm:self-start">
                  {s.done ? t("change") : t(`steps.${s.id}.button`)}
                </ButtonLink>
              )}
            </Card>
          </li>
        ))}
      </ol>

      <p className="text-lg">
        {t.rich("help", {
          phone: () => (
            <a href={siteContact.phoneHref} className="font-bold text-accent underline underline-offset-4">
              {siteContact.phone}
            </a>
          ),
        })}
      </p>
    </div>
  );
}
