import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";

const root = resolve(process.cwd());
const port = Number.parseInt(process.env.PORT || "8765", 10);
const host = process.env.HOST || "127.0.0.1";

const types = {
  ".html": "text/html;charset=utf-8",
  ".js": "text/javascript;charset=utf-8",
  ".css": "text/css;charset=utf-8",
  ".json": "application/json;charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
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

server.listen(port, host, () => {
  console.log(`BOOONG dashboard: http://${host}:${port}/`);
});
