"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Alert, Check, Close, Info } from "./icons";
import { cn } from "../utils";

export type ToastTone = "neutral" | "success" | "warning" | "danger";
export type ToastInput = { title: ReactNode; description?: ReactNode; tone?: ToastTone; durationMs?: number };
type ToastItem = ToastInput & { id: number };

const icons: Record<ToastTone, ReactNode> = {
  neutral: <Info />,
  success: <Check />,
  warning: <Alert />,
  danger: <Alert />,
};
const iconTone: Record<ToastTone, string> = {
  neutral: "text-fg-muted",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

/** A single toast, presentational. Use useToast() to show one. */
export function Toast({ title, description, tone = "neutral", onDismiss }: ToastInput & { onDismiss?: () => void }) {
  const t = useTranslations("design.ui");
  return (
    <div className="pointer-events-auto flex w-full items-start gap-3 rounded-md border border-border bg-surface p-4 text-fg shadow-lg animate-toast-in">
      <span className={cn("mt-0.5 shrink-0 [&_svg]:size-5", iconTone[tone])}>{icons[tone]}</span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-medium">{title}</p>
        {description && <p className="mt-0.5 text-sm text-fg-muted">{description}</p>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t("dismiss")}
          className="-m-2 inline-flex size-11 shrink-0 items-center justify-center rounded-sm text-fg-muted hover:bg-surface-2 [&_svg]:size-4"
        >
          <Close />
        </button>
      )}
    </div>
  );
}

const ToastContext = createContext<{ show: (toast: ToastInput) => void } | null>(null);

/**
 * `aboveTabBar`: lift toasts above a phone tab bar (<BottomNav>) so they never cover it.
 */
export function ToastProvider({ children, aboveTabBar }: { children: ReactNode; aboveTabBar?: boolean }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const t = useTranslations("design.ui");

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((i) => i.id !== id)), []);
  const show = useCallback((toast: ToastInput) => {
    const id = nextId.current++;
    setItems((list) => [...list.slice(-2), { ...toast, id }]);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <section
        aria-label={t("notifications")}
        aria-live="polite"
        className={cn(
          "pointer-events-none fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-md flex-col gap-2 px-4",
          aboveTabBar ? "pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-4" : "pb-[max(1rem,env(safe-area-inset-bottom))]",
        )}
      >
        {items.map((item) => (
          <AutoDismiss key={item.id} item={item} onDismiss={() => dismiss(item.id)} />
        ))}
      </section>
    </ToastContext.Provider>
  );
}

function AutoDismiss({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, item.durationMs ?? 5000);
    return () => window.clearTimeout(timer);
  }, [item.durationMs, onDismiss]);
  return <Toast {...item} onDismiss={onDismiss} />;
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
