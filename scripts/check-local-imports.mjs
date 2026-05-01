import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";

const roots = ["js", "scripts"];
const files = [];

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.isFile() && [".js", ".mjs"].includes(extname(path))) files.push(resolve(path));
  }
}

for (const root of roots) {
  if (statSync(root, { throwIfNoEntry: false })?.isDirectory()) walk(root);
}

function resolveLocal(from, specifier) {
  let target = resolve(dirname(from), specifier);
  const candidates = [];
  if (extname(target)) candidates.push(target);
  else candidates.push(`${target}.js`, `${target}.mjs`, join(target, "index.js"));
  return candidates.find(existsSync) || candidates[0];
}

function exportedNames(source) {
  const names = new Set();
  for (const match of source.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g)) names.add(match[1]);
  for (const match of source.matchAll(/export\s+(?:const|let|var|class)\s+([A-Za-z0-9_$]+)/g)) names.add(match[1]);
  if (/export\s+\*\s+from\s+["'][^"']+["']/.test(source)) names.add("*");
  for (const match of source.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const part of match[1].split(",")) {
      const cleaned = part.trim();
      if (!cleaned) continue;
      const alias = cleaned.split(/\s+as\s+/).at(-1).trim();
      if (alias !== "default") names.add(alias);
    }
  }
  return names;
}

const exportsByFile = new Map(files.map(file => [file, exportedNames(readFileSync(file, "utf8"))]));
const errors = [];

for (const file of files) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)) {
    const [, names, specifier] = match;
    if (!specifier.startsWith(".")) continue;
    const target = resolveLocal(file, specifier);
    if (!existsSync(target)) {
      errors.push(`${relative(process.cwd(), file)} imports missing ${specifier}`);
      continue;
    }
    const available = exportsByFile.get(resolve(target)) || new Set();
    for (const part of names.split(",")) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (name && !available.has(name) && !available.has("*")) {
        errors.push(`${relative(process.cwd(), file)} imports ${name} from ${relative(process.cwd(), target)}, but it is not exported`);
      }
    }
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Validated local named imports for ${files.length} files.`);
