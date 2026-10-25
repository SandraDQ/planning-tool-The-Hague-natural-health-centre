// Shared helpers for the read-only Wix export. Reads WIX_API_KEY / WIX_SITE_ID
// from .env and never prints them. Only GET and search/query POSTs are used.
import { readFileSync } from "node:fs";

export function loadEnv(path = ".env") {
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
  if (!process.env.WIX_API_KEY || !process.env.WIX_SITE_ID) {
    throw new Error("WIX_API_KEY and WIX_SITE_ID must be set in .env");
  }
}

// Read-only endpoints only. Anything else is refused before it leaves the machine.
const READ_ONLY = [/^GET /, /^POST .*\/(search|query)$/];

export async function wix(method, path, body) {
  const sig = `${method} ${path.split("?")[0]}`;
  if (!READ_ONLY.some((r) => r.test(sig))) throw new Error(`Refusing non-read call: ${sig}`);
  const res = await fetch(`https://www.wixapis.com/${path}`, {
    method,
    headers: {
      Authorization: process.env.WIX_API_KEY,
      "wix-site-id": process.env.WIX_SITE_ID,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${sig} -> ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json();
}
