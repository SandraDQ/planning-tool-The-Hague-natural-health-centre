import type { ComponentProps, ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "../utils";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "md" | "lg";

type StyleOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
};

/**
 * Class names for a button-looking element. Use one `primary` per screen.
 * md = 44px high (minimum tap target), lg = 52px.
 */
export function buttonClasses({ variant = "primary", size = "md", fullWidth, className }: StyleOptions = {}) {
  return cn(
    "inline-flex select-none items-center justify-center gap-2 rounded-sm font-medium",
    "transition-[background-color,color,border-color,box-shadow,transform] duration-150 ease-calm",
    "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    "[&_svg]:size-5 [&_svg]:shrink-0",
    size === "md" ? "min-h-11 px-5 text-base" : "min-h-13 px-7 text-base",
    variant === "primary" && "bg-accent text-on-accent shadow-sm hover:bg-accent-strong",
    variant === "secondary" && "border border-border-strong/50 bg-surface text-fg shadow-sm hover:bg-surface-2",
    variant === "ghost" && "text-accent hover:bg-accent-soft",
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
        "inline-flex size-11 shrink-0 items-center justify-center rounded-sm text-fg transition-colors duration-150 hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-5",
        className,
      )}
      {...props}
    />
  );
}
