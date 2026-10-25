"use client";

import { useState } from "react";
import Image from "next/image";
import { useFormatter, useTranslations } from "next-intl";
import { Avatar, Icons, SegmentedControl } from "@/design-system";
import { Link } from "@/i18n/navigation";

export type MenuEntry = {
  sessionTypeId: string;
  therapyId: string;
  therapistId: string;
  therapistName: string;
  serviceName: string;
  sessionTypeName: string;
  therapyName: string;
  durationMin: number;
  priceCents: number;
  depositCents: number;
};

export type MenuTherapist = { id: string; name: string; photoUrl: string | null; bio: string; therapies: string };
export type MenuTherapy = { id: string; name: string };
export type Grouping = "therapy" | "therapist";

/**
 * "What would you like to book?" — every bookable session, grouped by therapist
 * or by therapy. Each row is one tap to the time step, so service and session
 * type are chosen together (keeps home → confirmation within 5 screens).
 */
export function ServiceMenu({
  entries,
  therapists,
  therapies,
  initialGrouping = "therapist",
  allowRegroup = true,
  hideGroupHeader = false,
}: {
  entries: MenuEntry[];
  therapists: MenuTherapist[];
  therapies: MenuTherapy[];
  initialGrouping?: Grouping;
  allowRegroup?: boolean;
  hideGroupHeader?: boolean;
}) {
  const t = useTranslations("booking.choose");
  const [grouping, setGrouping] = useState<Grouping>(initialGrouping);

  const groups =
    grouping === "therapist"
      ? therapists.map((th) => ({ key: th.id, therapist: th, title: th.name, items: entries.filter((e) => e.therapistId === th.id) }))
      : therapies.map((ty) => ({ key: ty.id, therapist: null, title: ty.name, items: entries.filter((e) => e.therapyId === ty.id) }));
  const visible = groups.filter((g) => g.items.length > 0);
  // A page for one therapist already names them in its title.
  const hideHeader = hideGroupHeader && visible.length === 1;

  const setAndRemember = (g: Grouping) => {
    setGrouping(g);
    const url = new URL(window.location.href);
    url.searchParams.set("by", g);
    window.history.replaceState(null, "", url);
  };

  return (
    <div className="flex flex-col gap-8">
      {allowRegroup && (
        <SegmentedControl<Grouping>
          label={t("groupLabel")}
          value={grouping}
          onChange={setAndRemember}
          segments={[
            { value: "therapist", label: t("byTherapist") },
            { value: "therapy", label: t("byTherapy") },
          ]}
          className="self-start"
        />
      )}

      {visible.map((g) => (
        <section key={g.key} aria-labelledby={hideHeader ? "page-title" : `group-${g.key}`} className="flex flex-col gap-3">
          {hideHeader ? null : g.therapist ? (
            <div className="flex items-start gap-4">
              {g.therapist.photoUrl ? (
                <Image src={g.therapist.photoUrl} alt="" width={64} height={64} unoptimized className="size-16 shrink-0 rounded-full object-cover" />
              ) : (
                <Avatar name={g.therapist.name} />
              )}
              <div className="min-w-0">
                <h2 id={`group-${g.key}`} className="text-lg">
                  {g.therapist.name}
                </h2>
                {g.therapist.therapies && <p className="text-sm text-fg-muted">{g.therapist.therapies}</p>}
                {g.therapist.bio && <p className="mt-1 line-clamp-2 text-base">{g.therapist.bio}</p>}
              </div>
            </div>
          ) : (
            <h2 id={`group-${g.key}`} className="text-lg">
              {g.title}
            </h2>
          )}
          <ul className="flex flex-col gap-2">
            {g.items.map((item) => (
              <li key={item.sessionTypeId}>
                <MenuRow item={item} showTherapist={grouping === "therapy"} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function MenuRow({ item, showTherapist }: { item: MenuEntry; showTherapist: boolean }) {
  const t = useTranslations("booking");
  const format = useFormatter();
  const euro = (cents: number) => format.number(cents / 100, { style: "currency", currency: "EUR" });
  const duration = t("minutes", { minutes: item.durationMin });
  const balance = item.priceCents - item.depositCents;
  const sub = item.sessionTypeName && item.sessionTypeName !== item.serviceName ? item.sessionTypeName : null;
  return (
    <Link
      href={{ pathname: "/book/time", query: { st: item.sessionTypeId } }}
      aria-label={t("choose.chooseItem", {
        name: [item.serviceName, sub, showTherapist ? t("choose.with", { name: item.therapistName }) : null].filter(Boolean).join(", "),
        duration,
        price: euro(item.priceCents),
      })}
      className="group flex min-h-11 items-center gap-4 rounded-md border border-border bg-surface p-4 transition-[border-color,background-color] duration-150 hover:border-sage hover:bg-surface-2/40"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-base font-bold text-fg">{item.serviceName}</span>
        {(sub || showTherapist) && (
          <span className="text-sm text-fg-muted">
            {[sub, showTherapist ? t("choose.with", { name: item.therapistName }) : null].filter(Boolean).join(" · ")}
          </span>
        )}
        <span className="text-sm text-fg-muted">
          {balance > 0
            ? t("choose.deposit", { deposit: euro(item.depositCents), balance: euro(balance) })
            : t("choose.depositFull", { deposit: euro(item.depositCents) })}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end text-right">
        <span className="text-base font-bold tabular-nums">{euro(item.priceCents)}</span>
        <span className="text-sm text-fg-muted tabular-nums">{duration}</span>
      </span>
      <Icons.ChevronRight className="size-5 shrink-0 text-accent transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none" />
    </Link>
  );
}
