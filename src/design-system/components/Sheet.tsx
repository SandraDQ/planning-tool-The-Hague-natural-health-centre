"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { IconButton } from "./Button";
import { Close } from "./icons";
import { cn } from "../utils";

type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Buttons pinned to the bottom (one primary). */
  footer?: ReactNode;
  className?: string;
};

/**
 * Bottom sheet on phones, centred dialog from 640px up. Built on the native
 * <dialog>: focus is trapped, Esc closes, the page behind is inert.
 */
export function Sheet({ open, onClose, title, description, children, footer, className }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();
  const t = useTranslations("design.ui");

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      document.documentElement.style.overflow = "hidden";
    } else if (!open && dialog.open) {
      dialog.close();
    }
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClose={() => {
        document.documentElement.style.overflow = "";
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn(
        "m-0 mt-auto max-h-[88dvh] w-full max-w-none overflow-hidden rounded-t-lg bg-surface p-0 text-fg shadow-lg",
        "sm:m-auto sm:max-w-lg sm:rounded-lg",
        "backdrop:bg-scrim open:animate-sheet-up backdrop:animate-fade-in",
        className,
      )}
    >
      <div className="flex max-h-[88dvh] flex-col">
        <div aria-hidden="true" className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-border sm:hidden" />
        <div className="flex items-start gap-3 px-5 pt-3 pb-2 sm:px-6 sm:pt-5">
          <div className="min-w-0 flex-1 pt-2">
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 text-sm text-fg-muted">
                {description}
              </p>
            )}
          </div>
          <IconButton aria-label={t("close")} onClick={onClose} className="-mr-2">
            <Close />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3 sm:px-6">{children}</div>
        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-border px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-6 sm:pb-5">
            {footer}
          </div>
        )}
      </div>
    </dialog>
  );
}
