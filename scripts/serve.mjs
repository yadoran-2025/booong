import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";

const root = resolve(process.cwd());
const port = Number.parseInt(process.env.PORT || "8765", 10);
const host = process.env.HOST || "127.0.0.1";
// Explicitly enable the user-requested Watcha preview only in the loopback development server.
if (process.env.NODE_ENV !== "production" && ["127.0.0.1", "localhost", "::1"].includes(host)) {
  process.env.NODE_ENV ||= "development";
  process.env.BOOONG_WATCHA_PREVIEW = "1";
}
const authRoutes = new Map([
  ["/api/auth/dorms/start", "../api/auth/dorms/start.js"],
  ["/api/auth/dorms/callback", "../api/auth/dorms/callback.js"],
  ["/api/auth/dorms/session", "../api/auth/dorms/session.js"],
  ["/api/auth/dorms/logout", "../api/auth/dorms/logout.js"],
  ["/api/comments", "../api/comments.js"],
  ["/api/admin", "../api/admin.js"],
  ["/api/notices", "../api/notices.js"],
  ["/api/textbooks", "../api/textbooks.js"],
  ["/api/watcha-library", "../api/watcha-library.js"],
]);

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
  if (pathname.split("/").some(part => part.startsWith("."))) return null;
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
  const authRoute = authRoutes.get(new URL(req.url, "http://localhost").pathname);
  if (authRoute) {
    try { await (await import(authRoute)).default(req, res); }
    catch { res.writeHead(503); res.end("Authentication unavailable"); }
    return;
  }
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
