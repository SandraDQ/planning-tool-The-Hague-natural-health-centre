"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { SegmentedControl } from "./SegmentedControl";

import { THEME_STORAGE_KEY, type ThemeChoice } from "../theme";

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "dark") root.dataset.theme = "dark";
  else delete root.dataset.theme;
}

/**
 * Light (default, as on the current site) or dark (opt-in). Remembered per browser.
 * The device's dark-mode setting is deliberately NOT followed (D19: the site has no dark mode).
 */
export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations("design.ui.theme");
  const [choice, setChoice] = useState<ThemeChoice>("light");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === "dark") setChoice("dark");
    } catch {
      /* storage unavailable: keep following the device */
    }
  }, []);

  const change = (next: ThemeChoice) => {
    setChoice(next);
    apply(next);
    try {
      if (next === "dark") window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
      else window.localStorage.removeItem(THEME_STORAGE_KEY);
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
        { value: "light", label: t("light") },
        { value: "dark", label: t("dark") },
      ]}
    />
  );
}
