// Downloads every file from the Wix Media Manager into wix-export/media/<folder>/
// and writes wix-export/media/manifest.json. Read-only; safe to re-run (skips existing files).
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnv, wix } from "./lib.mjs";
import { listAllFiles } from "./inventory.mjs";

loadEnv();
const OUT = "wix-export/media";
const slug = (s) => s.normalize("NFKD").replace(/[^\w.\- ]+/g, "").trim().replace(/\s+/g, "-") || "file";

async function folderPaths() {
  let cursor, folders = [];
  do {
    const r = await wix("POST", "site-media/v1/folders/search", { paging: { limit: 100, cursor } });
    folders.push(...r.folders);
    cursor = r.nextCursor?.cursors?.next;
  } while (cursor);
  const byId = Object.fromEntries(folders.map((f) => [f.id, f]));
  const p = (id) => (!byId[id] ? "" : path.join(p(byId[id].parentFolderId), slug(byId[id].displayName)));
  return (id) => p(id) || "_root";
}

const folderOf = await folderPaths();
const files = await listAllFiles();
const manifest = [];
let done = 0, failed = 0;

async function fetchOne(f) {
  const dir = path.join(OUT, folderOf(f.parentFolderId));
  const ext = path.extname(f.id) || path.extname(f.displayName);
  const base = slug(path.basename(f.displayName, path.extname(f.displayName)));
  const file = path.join(dir, `${base}__${f.id.split(/[_~.]/)[1]?.slice(0, 8) ?? "x"}${ext}`);
  const url = f.url ?? f.media?.video?.resolutions?.[0]?.url;
  manifest.push({
    id: f.id, displayName: f.displayName, folder: folderOf(f.parentFolderId), file,
    mediaType: f.mediaType, private: f.private, sizeInBytes: +f.sizeInBytes,
    width: f.media?.image?.image?.width, height: f.media?.image?.image?.height,
    labels: f.labels, url, createdDate: f.createdDate,
  });
  if (existsSync(file)) return done++;
  mkdirSync(dir, { recursive: true });
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.status);
      await writeFile(file, Buffer.from(await res.arrayBuffer()));
      return done++;
    } catch (e) {
      if (i === 3) { failed++; console.error(`FAILED ${f.displayName}: ${e.message}`); }
      await new Promise((r) => setTimeout(r, 2000 * 2 ** i));
    }
  }
}

const queue = [...files];
await Promise.all(Array.from({ length: 8 }, async () => {
  while (queue.length) {
    await fetchOne(queue.shift());
    if ((done + failed) % 100 === 0) console.log(`${done + failed}/${files.length}`);
  }
}));
manifest.sort((a, b) => a.file.localeCompare(b.file));
writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`done ${done}, failed ${failed}, total ${files.length}`);
