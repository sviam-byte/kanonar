import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(".");
const EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const IGNORE_DIRS = new Set(["node_modules", "dist", "build", ".git", "archive"]);

const STUB_RE = /^\s*export\s*\{\s*\}\s*;\s*\/\/\s*Deleted\b/m;
const ARCHIVE_ROOT = path.resolve(ROOT, "archive", "deleted-stubs");

async function walk(dir, acc = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.isDirectory()) {
      if (IGNORE_DIRS.has(ent.name)) continue;
      await walk(path.join(dir, ent.name), acc);
      continue;
    }
    const ext = path.extname(ent.name);
    if (!EXTS.has(ext)) continue;
    acc.push(path.join(dir, ent.name));
  }
  return acc;
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function movePreserveTree(absFile) {
  const rel = path.relative(ROOT, absFile);
  const dst = path.join(ARCHIVE_ROOT, rel);
  await ensureDir(path.dirname(dst));
  await fs.rename(absFile, dst);
  return { rel, dstRel: path.relative(ROOT, dst) };
}

async function main() {
  await ensureDir(ARCHIVE_ROOT);
  const allFiles = await walk(ROOT);

  let moved = 0;
  const movedList = [];

  for (const f of allFiles) {
    const txt = await fs.readFile(f, "utf8").catch(() => "");
    if (!STUB_RE.test(txt)) continue;
    const { rel, dstRel } = await movePreserveTree(path.resolve(f));
    moved++;
    movedList.push({ rel, dstRel });
  }

  console.log(`Moved "Deleted" stubs: ${moved}`);
  for (const x of movedList.sort((a, b) => a.rel.localeCompare(b.rel))) {
    console.log(`${x.rel} -> ${x.dstRel}`);
  }
}

await main();