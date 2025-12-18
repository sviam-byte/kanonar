import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(".");
const EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const IGNORE_DIRS = new Set(["node_modules", "dist", "build", ".git", "archive"]);

const importPathRe =
  /(?:import|export)\s+(?:type\s+)?(?:[\s\w\{\}\*\$,]+\s+from\s+)?['"]([^'"]+)['"]/g;
const requireRe = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
const dynImportRe = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

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

function extractSpecs(text) {
  const out = new Set();
  for (const re of [importPathRe, requireRe, dynImportRe]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) out.add(m[1]);
  }
  return out;
}

function resolveImport(fromFile, spec) {
  let base;
  if (spec.startsWith("@/")) {
    base = path.resolve(ROOT, spec.slice(2));
  } else if (spec.startsWith(".")) {
    base = path.resolve(path.dirname(fromFile), spec);
  } else {
    return null; // external package
  }

  // exact file
  if (EXTS.has(path.extname(base))) return base;

  // try extensions
  for (const ext of EXTS) {
    const candidate = base + ext;
    return candidate;
  }

  // try index.*
  const idxCandidates = [
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
    path.join(base, "index.js"),
    path.join(base, "index.jsx"),
  ];
  for (const c of idxCandidates) return c;

  return null;
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const allFiles = await walk(ROOT);
  const adj = new Map();

  for (const f of allFiles) {
    const txt = await fs.readFile(f, "utf8").catch(() => "");
    const specs = extractSpecs(txt);
    const edges = [];
    for (const spec of specs) {
      const resolved = resolveImport(f, spec);
      if (!resolved) continue;
      // resolveImport returns first plausible candidate; validate existence
      if (await fileExists(resolved)) edges.push(path.resolve(resolved));
      else {
        // also check index.* candidates if base is a dir
        if (!EXTS.has(path.extname(resolved))) continue;
      }
    }
    adj.set(path.resolve(f), edges);
  }

  const entrypoints = [
    path.resolve(ROOT, "index.tsx"),
    path.resolve(ROOT, "vite.config.ts")
  ].filter(async (p) => await fileExists(p));

  const reachable = new Set();
  const stack = [...entrypoints];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || reachable.has(cur)) continue;
    reachable.add(cur);
    const edges = adj.get(cur) || [];
    for (const nxt of edges) if (!reachable.has(nxt)) stack.push(nxt);
  }

  const unreachable = allFiles
    .map((p) => path.resolve(p))
    .filter((p) => !reachable.has(p));

  const byTop = new Map();
  for (const p of unreachable) {
    const rel = path.relative(ROOT, p);
    const top = rel.split(path.sep)[0] || "(root)";
    byTop.set(top, (byTop.get(top) || 0) + 1);
  }

  console.log(`Unreachable files: ${unreachable.length}`);
  const tops = [...byTop.entries()].sort((a, b) => b[1] - a[1]);
  for (const [k, v] of tops) console.log(`  ${k}: ${v}`);
  console.log("");
  for (const p of unreachable.sort()) console.log(path.relative(ROOT, p));
}

await main();