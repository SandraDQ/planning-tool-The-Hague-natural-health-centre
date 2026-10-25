"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Avatar, Button, Card, TextField, Textarea } from "@/design-system";
import type { Therapist } from "@/lib/domain/types";
import { updateProfile } from "../actions/therapist";
import { useRunAction } from "../useRunAction";

export function ProfileEditor({ me }: { me: Therapist }) {
  const t = useTranslations("therapist.profile");
  const { pending, exec } = useRunAction("therapist");
  const [bio, setBio] = useState(me.bio);
  const [email, setEmail] = useState(me.publicEmail ?? "");
  const emailOk = !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <Card as="section" className="mt-6">
      <div className="flex items-center gap-4">
        <Avatar name={me.displayName} size="lg" />
        <div>
          <p className="font-heading text-lg">{me.displayName}</p>
          <p className="text-sm text-fg-muted">{t("nameHint")}</p>
          <p className="text-sm text-fg-muted">{t("photoHint")}</p>
        </div>
      </div>
      <form
        className="mt-6 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!emailOk) return;
          exec(() => updateProfile({ bio: { nl: bio.nl.trim(), en: bio.en.trim() }, publicEmail: email.trim() || null }), { success: t("saved") });
        }}
      >
        <Textarea label={t("bioNl")} rows={5} value={bio.nl} onChange={(e) => setBio({ ...bio, nl: e.target.value })} hint={t("bioHint")} />
        <Textarea label={t("bioEn")} rows={5} value={bio.en} onChange={(e) => setBio({ ...bio, en: e.target.value })} />
        <TextField
          label={t("publicEmail")}
          type="email"
          inputMode="email"
          optional
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="naam@praktijk.nl"
          hint={t("publicEmailHint")}
          error={!emailOk ? t("emailError") : undefined}
        />
        <div>
          <Button type="submit" disabled={pending}>
            {t("save")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
