// What a receipt upload may be: a photo (JPEG, PNG, WebP) or a PDF, recognised by its
// first bytes (never by the name or the browser's word for it), at most 5 MB.

import type { ReceiptFile } from "@/lib/domain/types";

export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;

export function sniffReceipt(b: Uint8Array): ReceiptFile["mimeType"] | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 12 && String.fromCharCode(...b.subarray(0, 4)) === "RIFF" && String.fromCharCode(...b.subarray(8, 12)) === "WEBP") return "image/webp";
  if (b.length >= 5 && String.fromCharCode(...b.subarray(0, 5)) === "%PDF-") return "application/pdf";
  return null;
}

export const RECEIPT_EXT: Record<ReceiptFile["mimeType"], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** A file name that is safe on every system: letters, digits, dash, dot. */
export function safeFileName(raw: string, ext: string): string {
  const base = raw
    .replace(/\.[a-z0-9]{1,5}$/i, "")
    .normalize("NFKD")
    .replace(/[^\w\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return `${base || "receipt"}.${ext}`;
}
