"use client";

import { useState } from "react";
import { Button, Icons } from "@/design-system";

/** Shows the link in a read-only field (selectable) with a big Copy button. */
export function CopyLink({ url, label, copyLabel, copiedLabel }: { url: string; label: string; copyLabel: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <label className="min-w-0 flex-1">
        <span className="mb-1 block text-base text-fg">{label}</span>
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="min-h-12 w-full rounded-sm border border-border-strong bg-surface px-3 font-mono text-sm text-fg"
        />
      </label>
      <Button
        type="button"
        variant="secondary"
        leadingIcon={copied ? <Icons.Check /> : undefined}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 3000);
          } catch {
            setCopied(false);
          }
        }}
      >
        <span aria-live="polite">{copied ? copiedLabel : copyLabel}</span>
      </Button>
    </div>
  );
}
