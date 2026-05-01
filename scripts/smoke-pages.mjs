import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";

const root = resolve(process.cwd());
const pages = [
  "index.html",
  "author.html",
  "asset-search.html",
  "worksheet-maker.html",
  "print.html",
  "select.html",
  "about.html",
  "connect.html",
];
const legacyRefs = [
  "js/" + "author.js",
  "js/ui/" + "blocks.js",
  "js/" + "asset-search.js",
  "js/" + "worksheet-maker.js",
];
const types = {
  ".html": "text/html;charset=utf-8",
  ".js": "text/javascript;charset=utf-8",
  ".css": "text/css;charset=utf-8",
  ".json": "application/json;charset=utf-8",
  ".svg": "image/svg+xml",
};

function resolveRequest(url = "/") {
  const pathname = decodeURIComponent(url.split("?")[0] || "/");
  const relative = normalize(pathname.replace(/^\/+/, ""));
  const target = resolve(join(root, relative || "index.html"));
  if (target !== root && !target.startsWith(root + sep)) return null;
  return target;
}

async function fileForRequest(url) {
  const target = resolveRequest(url);
  if (!target) return null;
  const info = await stat(target).catch(() => null);
  if (info?.isDirectory()) return join(target, "index.html");
  return target;
}

function localRefs(html) {
  const refs = [];
  for (const match of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)) {
    const ref = match[1];
    if (/^(https?:|mailto:|tel:|#)/i.test(ref)) continue;
    if (!/\.(?:js|css|json|svg|png|jpe?g|webp|pdf)(?:[?#].*)?$/i.test(ref)) continue;
    refs.push(ref.split(/[?#]/)[0]);
  }
  return refs;
}

const server = createServer(async (req, res) => {
  const file = await fileForRequest(req.url);
  if (!file) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const body = await readFile(file);
    res.setHeader("content-type", types[extname(file).toLowerCase()] || "application/octet-stream");
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});

const errors = [];
const port = await new Promise(resolvePort => server.listen(0, "127.0.0.1", () => resolvePort(server.address().port)));

try {
  for (const page of pages) {
    const response = await fetch(`http://127.0.0.1:${port}/${page}`);
    if (!response.ok) errors.push(`${page} returned ${response.status}`);
    const html = await response.text();
    for (const ref of localRefs(html)) {
      const refResponse = await fetch(`http://127.0.0.1:${port}/${ref}`);
      if (!refResponse.ok) errors.push(`${page} references missing ${ref} (${refResponse.status})`);
    }
  }

  const searchable = [
    ...pages,
    ...["js", "css", "scripts"].flatMap(dir => collectFiles(dir).filter(file => /\.(?:js|mjs|css|html)$/.test(file))),
  ];
  for (const file of searchable) {
    const text = readFileSync(file, "utf8");
    for (const legacy of legacyRefs) {
      if (text.includes(legacy)) errors.push(`${file} still references legacy path ${legacy}`);
    }
  }
} finally {
  await new Promise(resolveClose => server.close(resolveClose));
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Smoke checked ${pages.length} pages.`);

function collectFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  function visit(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) out.push(path);
    }
  }
  visit(dir);
  return out;
}
