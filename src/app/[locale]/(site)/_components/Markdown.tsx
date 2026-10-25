import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/design-system";
import { SiteImage } from "./SiteImage";

/*
 * A small Markdown renderer for the site's own text (blog posts exported from Wix,
 * therapist bios, privacy text). It supports only what that text uses: headings,
 * paragraphs (single line breaks kept), lists, quotes, rules, images with captions,
 * simple pipe tables, links, bold and italics. Internal links ("/about-us") stay inside the current language.
 */

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "p"; lines: string[] }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "quote"; lines: string[] }
  | { type: "hr" }
  | { type: "table"; head: string[]; rows: string[][] }
  | { type: "image"; alt: string; src: string; caption?: string };

const IMAGE_LINE = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/;

function parseBlocks(md: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] | null = null;
  const flush = () => {
    if (para && para.length) blocks.push({ type: "p", lines: para });
    para = null;
  };
  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    let m: RegExpMatchArray | null;
    if (/^\|.*\|$/.test(line.trim())) {
      flush();
      const cells = line.trim().slice(1, -1).split("|").map((c) => c.trim());
      const last = blocks[blocks.length - 1];
      if (cells.every((c) => /^:?-{3,}:?$/.test(c))) continue; // header separator row
      if (last?.type === "table") last.rows.push(cells);
      else blocks.push({ type: "table", head: cells, rows: [] });
    } else if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
      flush();
      if (m[2].trim()) blocks.push({ type: "heading", level: m[1].length, text: m[2].trim() });
    } else if (/^-{3,}$/.test(line.trim())) {
      flush();
      blocks.push({ type: "hr" });
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      flush();
      const last = blocks[blocks.length - 1];
      if (last?.type === "quote") last.lines.push(m[1]);
      else blocks.push({ type: "quote", lines: [m[1]] });
    } else if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
      flush();
      const item = m[1];
      const img = item.match(IMAGE_LINE);
      if (img) {
        blocks.push({ type: "image", alt: img[1], src: img[2] });
        continue;
      }
      const last = blocks[blocks.length - 1];
      if (last?.type === "ul") last.items.push(item);
      else blocks.push({ type: "ul", items: [item] });
    } else if ((m = line.match(/^\s*\d+\.\s+(.*)$/))) {
      flush();
      const last = blocks[blocks.length - 1];
      if (last?.type === "ol") last.items.push(m[1]);
      else blocks.push({ type: "ol", items: [m[1]] });
    } else if ((m = line.trim().match(IMAGE_LINE))) {
      flush();
      blocks.push({ type: "image", alt: m[1], src: m[2] });
    } else {
      para = para ?? [];
      para.push(line.trim());
    }
  }
  flush();

  // Wix repeats an image's caption as the paragraph right after it: show it as the caption.
  const plain = (s: string) => s.replace(/\*\*|__|(^|\s)_|_(\s|$)/g, "$1$2").replace(/\s+/g, " ").trim();
  for (let i = 0; i < blocks.length - 1; i++) {
    const b = blocks[i];
    const next = blocks[i + 1];
    if (b.type === "image" && b.alt && next.type === "p" && plain(next.lines.join(" ")) === plain(b.alt)) {
      b.caption = next.lines.join(" ");
      blocks.splice(i + 1, 1);
    }
  }
  return blocks;
}

const INLINE =
  /(!\[[^\]]*\]\([^)\s]+\))|(\[[^\]]*\]\([^)\s]+\))|(\*\*[\s\S]+?\*\*)|((?<![\w])_[^_\n]+?_(?![\w]))|((?<![\w*])\*[^*\s][^*\n]*?\*(?![\w*]))/;

export function renderInline(text: string, keyPrefix = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let k = 0;
  while (rest) {
    const m = rest.match(INLINE);
    if (!m || m.index === undefined) {
      out.push(rest);
      break;
    }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const tok = m[0];
    const key = `${keyPrefix}-${k++}`;
    if (m[1]) {
      const im = tok.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/)!;
      out.push(<SiteImage key={key} image={{ src: im[2], alt: im[1] }} sizes="(min-width: 980px) 640px, 100vw" className="my-4" />);
    } else if (m[2]) {
      const lm = tok.match(/^\[([^\]]*)\]\(([^)\s]+)\)$/)!;
      out.push(
        <SmartLink key={key} href={lm[2]}>
          {renderInline(lm[1], key)}
        </SmartLink>,
      );
    } else if (m[3]) {
      out.push(<strong key={key}>{renderInline(tok.slice(2, -2), key)}</strong>);
    } else {
      out.push(<em key={key}>{renderInline(tok.slice(1, -1), key)}</em>);
    }
    rest = rest.slice(m.index + tok.length);
  }
  return out;
}

const linkClass = "text-accent underline decoration-1 underline-offset-4 hover:text-accent-strong";

export function SmartLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  if (href.startsWith("/") && !href.startsWith("//")) {
    return (
      <Link href={href} className={cn(linkClass, className)}>
        {children}
      </Link>
    );
  }
  const external = /^https?:/.test(href);
  return (
    <a href={href} className={cn(linkClass, className)} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {children}
    </a>
  );
}

function withBreaks(lines: string[], key: string) {
  return lines.flatMap((l, i) => (i === 0 ? renderInline(l, `${key}-${i}`) : [<br key={`${key}-br${i}`} />, ...renderInline(l, `${key}-${i}`)]));
}

/**
 * Renders Markdown as the site's article typography.
 * `size="sm"` for short blocks (cards); `"lead"` for the site's large 19–24px text (therapist bios).
 */
export function Markdown({ source, className, size = "base" }: { source: string; className?: string; size?: "base" | "sm" | "lead" }) {
  const blocks = parseBlocks(source);
  return (
    <div className={cn("flex flex-col", size === "lead" ? "gap-5 text-lead" : "gap-4 text-base", size === "sm" && "gap-3", className)}>
      {blocks.map((b, i) => {
        const key = `b${i}`;
        switch (b.type) {
          case "heading": {
            const level = Math.min(6, Math.max(2, b.level));
            const cls = level <= 2 ? "mt-6 text-xl" : level === 3 ? "mt-4 text-lg" : "mt-3 text-base font-normal";
            const Tag = (level <= 2 ? "h2" : level === 3 ? "h3" : "h4") as "h2" | "h3" | "h4";
            return (
              <Tag key={key} className={cls}>
                {renderInline(b.text, key)}
              </Tag>
            );
          }
          case "p":
            return <p key={key}>{withBreaks(b.lines, key)}</p>;
          case "ul":
          case "ol": {
            const Tag = b.type;
            return (
              <Tag key={key} className={cn("flex flex-col gap-1.5 pl-6", b.type === "ul" ? "list-disc" : "list-decimal")}>
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it, `${key}-${j}`)}</li>
                ))}
              </Tag>
            );
          }
          case "quote":
            return (
              <blockquote key={key} className="border-l-2 border-sage pl-4 font-heading text-lg font-light text-fg-muted">
                {withBreaks(b.lines, key)}
              </blockquote>
            );
          case "hr":
            return <hr key={key} className="my-2 border-border" />;
          case "table":
            return (
              <div key={key} className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border-strong">
                      {b.head.map((h, j) => (
                        <th key={j} scope="col" className="px-3 py-2 font-heading font-normal">
                          {renderInline(h, `${key}-h${j}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j} className="border-b border-border align-top">
                        {r.map((c, n) => (
                          <td key={n} className="px-3 py-2">
                            {renderInline(c, `${key}-${j}-${n}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "image":
            return (
              <figure key={key} className="my-2">
                <SiteImage image={{ src: b.src, alt: b.alt }} sizes="(min-width: 980px) 720px, 100vw" />
                {b.caption && <figcaption className="mt-2 text-sm text-fg-muted">{renderInline(b.caption, key)}</figcaption>}
              </figure>
            );
        }
      })}
    </div>
  );
}
