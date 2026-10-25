"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { SegmentedControl } from "./SegmentedControl";

import { THEME_STORAGE_KEY, type ThemeChoice } from "../theme";

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;
}

/** Lets the visitor follow the device or force light/dark. Remembered per browser. */
export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations("design.ui.theme");
  const [choice, setChoice] = useState<ThemeChoice>("system");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === "light" || stored === "dark") setChoice(stored);
    } catch {
      /* storage unavailable: keep following the device */
    }
  }, []);

  const change = (next: ThemeChoice) => {
    setChoice(next);
    apply(next);
    try {
      if (next === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
      else window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  };

  return (
    <SegmentedControl
      label={t("label")}
      value={choice}
      onChange={change}
      className={className}
      segments={[
        { value: "system", label: t("system") },
        { value: "light", label: t("light") },
        { value: "dark", label: t("dark") },
      ]}
    />
  );
}
