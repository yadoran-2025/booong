import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = ["js", "scripts"];
const files = [];
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.isFile() && (path.endsWith(".js") || path.endsWith(".mjs"))) files.push(path);
  }
}

for (const root of roots) {
  if (statSync(root, { throwIfNoEntry: false })?.isDirectory()) walk(root);
}

function asScript(source) {
  return source
    .replace(/^\s*import\s+[^;\n]+;?\s*$/gm, "")
    .replace(/^\s*export\s+\*\s+from\s+["'][^"']+["'];?\s*$/gm, "")
    .replace(/^\s*export\s+\{[^}]+\}\s+from\s+["'][^"']+["'];?\s*$/gm, "")
    .replace(/^\s*export\s+\{[^}]+\};?\s*$/gm, "")
    .replace(/\bexport\s+(?=(?:async\s+)?function|class|const|let|var)/g, "")
    .replace(/\bimport\.meta\b/g, "({ url: '' })");
}

const failures = [];
for (const file of files.sort()) {
  try {
    new AsyncFunction(asScript(readFileSync(file, "utf8")));
  } catch (err) {
    failures.push(`${file}\n${err.message}`);
  }
}

if (failures.length) {
  console.error(failures.join("\n\n"));
  process.exit(1);
}

console.log(`Checked ${files.length} JS files.`);
