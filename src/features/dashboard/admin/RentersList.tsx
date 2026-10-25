"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Avatar, Badge, Button, Card, Checkbox, EmptyState, Icons, Sheet, TextField, type BadgeTone } from "@/design-system";
import { Link } from "@/i18n/navigation";
import type { Locale, OnboardingStatus, Room, Therapist, Therapy } from "@/lib/domain/types";
import { PageHeading } from "../components/Page";
import { inviteRenter } from "../actions/admin";
import { useRunAction } from "../useRunAction";

const tone: Record<OnboardingStatus, BadgeTone> = { invited: "warning", in_progress: "accent", complete: "success" };

export function RentersList({ therapists, therapies, rooms }: { therapists: Therapist[]; therapies: Therapy[]; rooms: Room[] }) {
  const t = useTranslations("admin.renters");
  const locale = useLocale() as Locale;
  const [inviting, setInviting] = useState(false);
  const therapyName = new Map(therapies.map((x) => [x.id, x.name[locale]]));
  const privateRoom = new Map(rooms.filter((r) => r.privateTherapistId).map((r) => [r.privateTherapistId!, r.number]));

  return (
    <>
      <PageHeading
        title={t("title")}
        description={t("lead")}
        actions={
          <Button leadingIcon={<Icons.Plus />} onClick={() => setInviting(true)}>
            {t("invite")}
          </Button>
        }
      />
      {therapists.length === 0 ? (
        <Card className="mt-6">
          <EmptyState icon={<Icons.Users />} title={t("emptyTitle")} description={t("emptyText")} />
        </Card>
      ) : (
        <ul className="mt-6 grid gap-3 md:grid-cols-2">
          {therapists.map((x) => (
            <li key={x.id}>
              <Card as={Link} href={`/admin/renters/${x.id}`} interactive padded={false} className="flex h-full items-start gap-4 p-4">
                <Avatar name={x.displayName} />
                <div className="min-w-0 flex-1">
                  <p className="font-heading text-lg">{x.displayName}</p>
                  <p className="text-sm text-fg-muted">
                    {x.therapyIds.map((id) => therapyName.get(id)).filter(Boolean).join(", ") || t("noTherapies")}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge tone={tone[x.onboardingStatus]}>{t(`onboarding.${x.onboardingStatus}`)}</Badge>
                    <Badge tone={x.bookable ? "success" : "neutral"}>{x.bookable ? t("bookable") : t("notBookable")}</Badge>
                    {x.paperCalendar && <Badge tone="neutral">{t("paper")}</Badge>}
                    {privateRoom.has(x.id) && <Badge tone="accent">{t("privateRoom", { number: privateRoom.get(x.id)! })}</Badge>}
                  </div>
                </div>
                <Icons.ChevronRight className="mt-3 size-5 shrink-0 text-fg-muted" />
              </Card>
            </li>
          ))}
        </ul>
      )}
      {inviting && <InviteSheet therapies={therapies} onClose={() => setInviting(false)} />}
    </>
  );
}

function InviteSheet({ therapies, onClose }: { therapies: Therapy[]; onClose: () => void }) {
  const t = useTranslations("admin.renters");
  const locale = useLocale() as Locale;
  const { pending, exec } = useRunAction("admin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [ids, setIds] = useState<string[]>([]);
  const [tried, setTried] = useState(false);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const submit = () => {
    setTried(true);
    if (!name.trim() || !emailOk) return;
    exec(() => inviteRenter({ displayName: name.trim(), email: email.trim(), therapyIds: ids }), {
      success: t("invited"),
      successText: t("invitedText", { email: email.trim() }),
      onSuccess: onClose,
    });
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={t("inviteTitle")}
      description={t("inviteText")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button onClick={submit} disabled={pending}>
            {t("sendInvite")}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4 pb-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <TextField
          label={t("name")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
          error={tried && !name.trim() ? t("nameError") : undefined}
        />
        <TextField
          label={t("email")}
          type="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="off"
          error={tried && !emailOk ? t("emailError") : undefined}
        />
        <fieldset>
          <legend className="text-sm font-medium">{t("therapies")}</legend>
          <div className="mt-1 grid sm:grid-cols-2">
            {therapies
              .filter((x) => x.active)
              .map((x) => (
                <Checkbox
                  key={x.id}
                  label={x.name[locale]}
                  checked={ids.includes(x.id)}
                  onChange={(e) => setIds(e.target.checked ? [...ids, x.id] : ids.filter((i) => i !== x.id))}
                />
              ))}
          </div>
        </fieldset>
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}
