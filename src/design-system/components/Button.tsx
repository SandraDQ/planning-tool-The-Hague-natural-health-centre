import type { ComponentProps, ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "../utils";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

type StyleOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
};

/**
 * Class names for a button-looking element, styled like the current site's
 * buttons (flat brand green, Lato, square-ish corners). Use one `primary` per screen.
 * sm = 44px high with less side padding (tight rows, e.g. the phone header), md = 44px, lg = 52px.
 */
export function buttonClasses({ variant = "primary", size = "md", fullWidth, className }: StyleOptions = {}) {
  return cn(
    "inline-flex select-none items-center justify-center gap-2 rounded-sm font-normal tracking-[0.02em]",
    "transition-[background-color,color,border-color,box-shadow,transform] duration-150 ease-calm",
    "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    "[&_svg]:size-5 [&_svg]:shrink-0",
    size === "sm" ? "min-h-11 px-3.5 text-base" : size === "md" ? "min-h-11 px-5 text-base" : "min-h-13 px-7 text-base",
    variant === "primary" && "bg-accent text-on-accent hover:bg-accent-strong",
    variant === "secondary" && "border border-accent bg-surface text-accent hover:bg-accent-soft hover:text-accent-strong",
    variant === "ghost" && "text-accent underline-offset-4 hover:bg-surface-2 hover:underline",
    fullWidth && "w-full",
    className,
  );
}

type ButtonProps = ComponentProps<"button"> &
  StyleOptions & {
    leadingIcon?: ReactNode;
    trailingIcon?: ReactNode;
  };

export function Button({
  variant,
  size,
  fullWidth,
  className,
  leadingIcon,
  trailingIcon,
  type = "button",
  children,
  ...props
}: ButtonProps) {
  return (
    <button type={type} className={buttonClasses({ variant, size, fullWidth, className })} {...props}>
      {leadingIcon}
      {children}
      {trailingIcon}
    </button>
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> &
  StyleOptions & {
    leadingIcon?: ReactNode;
    trailingIcon?: ReactNode;
  };

/** A link that looks like a button (locale-aware, via next-intl). */
export function ButtonLink({
  variant,
  size,
  fullWidth,
  className,
  leadingIcon,
  trailingIcon,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link className={buttonClasses({ variant, size, fullWidth, className })} {...props}>
      {leadingIcon}
      {children}
      {trailingIcon}
    </Link>
  );
}

/** Square icon-only button, 44×44. Always pass an aria-label. */
export function IconButton({
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { "aria-label": string }) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-sm text-fg transition-colors duration-150 hover:bg-surface-2 hover:text-accent disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-5",
        className,
      )}
      {...props}
    />
  );
}
