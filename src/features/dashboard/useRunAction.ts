"use client";

import { useCallback, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useToast } from "@/design-system";
import type { ActionResult } from "./actions/result";

type Options<T> = {
  /** Toast title on success. */
  success?: string;
  successText?: string;
  onSuccess?: (data: T) => void;
  /** Return true when the error was shown inline, to skip the toast. */
  onError?: (result: Extract<ActionResult<T>, { ok: false }>) => boolean | void;
};

/**
 * Runs a dashboard server action with a pending state and a friendly toast.
 * Error codes map to `<namespace>.errors.<code>` messages.
 */
export function useRunAction(namespace: "admin" | "therapist") {
  const t = useTranslations(namespace);
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const exec = useCallback(
    <T,>(fn: () => Promise<ActionResult<T>>, options: Options<T> = {}) => {
      startTransition(async () => {
        let result: ActionResult<T>;
        try {
          result = await fn();
        } catch {
          result = { ok: false, code: "unknown" };
        }
        if (result.ok) {
          if (options.success) toast.show({ title: options.success, description: options.successText, tone: "success" });
          options.onSuccess?.(result.data);
        } else if (!options.onError?.(result)) {
          toast.show({ title: t(`errors.${result.code}`), tone: "danger" });
        }
      });
    },
    [t, toast],
  );

  return { pending, exec };
}
