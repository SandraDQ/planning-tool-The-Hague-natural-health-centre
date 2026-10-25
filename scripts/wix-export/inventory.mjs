// Lists every file in the Wix Media Manager (all folders) and prints a summary.
import { loadEnv, wix } from "./lib.mjs";

export async function listAllFiles() {
  let cursor, all = [];
  do {
    const r = await wix("POST", "site-media/v1/files/search", { paging: { limit: 100, cursor } });
    all.push(...r.files);
    cursor = r.nextCursor?.cursors?.next;
  } while (cursor);
  return all;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  loadEnv();
  const files = await listAllFiles();
  const sum = {};
  for (const f of files) {
    const k = `${f.mediaType}${f.private ? " (private)" : ""}`;
    sum[k] ??= { count: 0, mb: 0 };
    sum[k].count++;
    sum[k].mb += +f.sizeInBytes / 1e6;
  }
  console.log(files.length, sum);
}
