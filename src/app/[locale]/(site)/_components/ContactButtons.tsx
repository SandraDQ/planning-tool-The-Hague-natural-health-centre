import { Icons, cn } from "@/design-system";

export type ContactLink = { kind: string; label: string; href: string };

const icon = (kind: string) =>
  kind === "email" ? <Icons.Mail /> : kind === "phone" ? <Icons.Phone /> : <Icons.MessageCircle />;

const external = (href: string) => (href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {});

/** The home page's WhatsApp pill under each therapist (icon only, as on the live site; the label is its accessible name). */
export function WhatsAppIconButton({ href, label, className }: { href: string; label: string; className?: string }) {
  return (
    <a
      href={href}
      aria-label={label}
      title={label}
      {...external(href)}
      className={cn(
        "inline-flex h-11 w-30 items-center justify-center rounded-full bg-fg/10 text-accent-strong transition-colors duration-150 hover:bg-fg/20 [&_svg]:size-7",
        className,
      )}
    >
      <Icons.MessageCircle />
    </a>
  );
}

/**
 * A therapist's contact icons on the About page (email / WhatsApp / phone), round as on the live site.
 * Each icon's accessible name is the site's own label ("Email Sandra", "Whatsapp Sandra").
 */
export function ContactButtons({ links, className }: { links: ContactLink[]; className?: string }) {
  if (!links.length) return null;
  return (
    <ul className={cn("flex flex-wrap justify-center gap-2", className)}>
      {links.map((l) => (
        <li key={l.href}>
          <a
            href={l.href}
            title={l.label}
            {...external(l.href)}
            className="inline-flex size-11 items-center justify-center rounded-full bg-fg/10 text-accent-strong transition-colors duration-150 hover:bg-fg/20 [&_svg]:size-5"
          >
            {icon(l.kind)}
            <span className="sr-only">{l.label}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
