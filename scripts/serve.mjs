import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { isLoopbackRequest, withLocalAdmin } from "../lib/local-admin.js";

const root = resolve(process.cwd());
const port = Number.parseInt(process.env.PORT || "8765", 10);
const host = process.env.HOST || "127.0.0.1";
const localRiceBasket = process.env.NODE_ENV !== "production" && !process.env.VERCEL
  && ["127.0.0.1", "localhost", "::1"].includes(host)
  ? await import('./rice-basket-local.mjs') : null;
const riceBasket = localRiceBasket?.createLocalRiceBasket(join(root, '.data/rice-basket.json'));
const localAdmin = localRiceBasket ? await import('./admin-local.mjs') : null;
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
  ["/api/lesson-thumbnails", "../api/admin.js"],
  ["/api/lesson-catalog", "../api/admin.js"],
  ["/api/rice-basket", "../api/rice-basket.js"],
  ["/api/bungmo-session", "../api/bungmo-session.js"],
  ["/api/notices", "../api/notices.js"],
  ["/api/research-erp", "../api/research-erp.js"],
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
  const pathname = new URL(req.url, "http://localhost").pathname;
  const localRequest = localAdmin && isLoopbackRequest(req);
  if (localRequest && ['/js/admin.js', '/js/local-admin-home.js', '/js/local-admin-auth.js'].includes(pathname)) {
    const source = pathname.endsWith('/local-admin-auth.js') ? localAdmin.localAdminAuthSource
      : localAdmin.localAdminHomeSource(await readFile(join(root, 'js/admin.js'), 'utf8'));
    res.writeHead(200, { 'Content-Type': 'text/javascript;charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(source);
    return;
  }
  if (localRequest && pathname === '/api/rice-basket') {
    try { await riceBasket(req, res); }
    catch { res.writeHead(503); res.end('Local storage unavailable'); }
    return;
  }
  if (localRequest && ['/rice-basket/operator.js', '/rice-basket/local-auth.js'].includes(pathname)) {
    const source = pathname.endsWith('/local-auth.js') ? localRiceBasket.localAuthSource
      : (await readFile(join(root, 'rice-basket/operator.js'), 'utf8')).replace('../js/admin.js', './local-auth.js');
    res.writeHead(200, { 'Content-Type': 'text/javascript;charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(source);
    return;
  }
  const authRoute = authRoutes.get(new URL(req.url, "http://localhost").pathname);
  if (authRoute) {
    try {
      const run = () => import(authRoute).then(module => module.default(req, res));
      if (localRequest && ['/api/admin', '/api/lesson-catalog', '/api/lesson-thumbnails', '/api/notices', '/api/research-erp', '/api/textbooks', '/api/watcha-library', '/api/bungmo-session'].includes(pathname)) await withLocalAdmin(req, run);
      else await run();
    }
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
    let body = await readFile(file);
    if (localRequest && (pathname === '/bungmo' || pathname.startsWith('/bungmo/')) && extname(file) === '.html') {
      body = body.toString('utf8').replace('<head>', '<head><script>window.__BOOONG_LOCAL_ADMIN__=true;</script>');
      res.setHeader('Cache-Control', 'no-store');
    }
    res.setHeader("content-type", types[extname(file).toLowerCase()] || "application/octet-stream");
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});

server.listen(port, host, () => {
  console.log(`BOOONG dashboard: http://${host}:${server.address().port}/`);
});
