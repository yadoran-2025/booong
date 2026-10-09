import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { safeNoticeLink, validateNoticeInput } from "../js/notices.js";
import { renderNoticeArticle } from "../js/ui/notices.js";
import { MEMBER_PROFILE_SHEET_URL } from "../js/member-data.js";
import { readFileSync } from "node:fs";
import vm from "node:vm";

assert.deepEqual(validateNoticeInput({ title: " 공지 ", body: " 내용\n두 번째 줄 ", link: "" }), { title: "공지", body: "내용\n두 번째 줄", link: "" });
for (const link of ["javascript:alert(1)", "data:text/html,test", "//evil.example", "https://user:password@example.com", "https://example.com\\evil", "https://example.com\n"]) {
  assert.equal(safeNoticeLink(link), "");
}

// Run the real rolling widget with a controlled clock and DOM, without publishing test notices.
class NoticeElement extends EventTarget {
  children = [];
  selectors = new Map();
  attributes = new Map();
  textContent = "";
  innerHTML = "";
  disabled = false;
  hidden = true;
  isConnected = true;
  offsetHeight = 44;
  hover = false;
  focused = false;
  get firstElementChild() { return this.children[0]; }
  append(...elements) { elements.forEach(element => { element.parent = this; this.children.push(element); }); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(element => element !== this); }
  querySelector(selector) { return this.selectors.get(selector) || null; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  matches() { return this.hover || this.focused; }
  showModal() { this.open = true; }
  animate(frames, options) {
    let finish, cancel;
    const finished = new Promise((resolve, reject) => { finish = resolve; cancel = reject; });
    this.animation = { frames, options, finished, finish, cancel: () => cancel(new Error("cancelled")) };
    return this.animation;
  }
}
const uiSource = readFileSync(new URL("../js/ui/notices.js", import.meta.url), "utf8").replace(/^import .+;$/gm, "").replace(/^export /gm, "");
async function widget(notices) {
  const host = new NoticeElement(), news = new NoticeElement(), row = new NoticeElement(), track = new NoticeElement();
  const position = new NoticeElement(), play = new NoticeElement(), all = new NoticeElement(), dialog = new NoticeElement(), content = new NoticeElement();
  host.selectors = new Map([[".library-notices", news], ["dialog", dialog]]);
  news.selectors = new Map([[".library-notices__row", row], [".library-notices__track", track], [".library-notices__position", position], [".library-notices__play", notices.length > 1 ? play : null], [".library-notices__all", all]]);
  dialog.selectors = new Map([[".notice-dialog__content", content], ["h2", new NoticeElement()]]);
  content.selectors.set("h3", new NoticeElement());
  const motion = new EventTarget();
  motion.matches = false;
  const document = { hidden: false, createElement: () => new NoticeElement(), querySelector: () => dialog.open ? dialog : null };
  const intervals = new Map();
  let id = 0, reads = 0;
  const context = vm.createContext({ readNotices: async () => { reads++; return notices; }, renderNoticeArticle, safeNoticeLink, escapeHtml: value => String(value).replaceAll("<", "&lt;"), AbortController, console, document,
    matchMedia: () => motion, setInterval: callback => { intervals.set(++id, callback); return id; }, clearInterval: key => intervals.delete(key) });
  vm.runInContext(`${uiSource}\nthis.bind = bindNotices;`, context);
  const root = { querySelector: () => host };
  await context.bind(root);
  return { host, news, row, track, position, play, all, dialog, content, motion, document, intervals, context, root, reads: () => reads };
}

const fixtures = [
  { id: "first", title: "첫 공지", body: "첫 내용", link: "", created_at: "2026-10-08T00:00:00Z" },
  { id: "second", title: "둘째 공지", body: "둘째 내용", link: "https://example.com", created_at: "2026-10-07T00:00:00Z" },
];
const ui = await widget(fixtures);
assert.equal(ui.row.attributes.get("aria-label"), "첫 공지");
assert.equal(ui.track.children.length, 1);
async function advance() {
  const pending = [...ui.intervals.values()][0]();
  assert.equal(ui.track.children.length, 2, "The next notice starts below the visible notice");
  assert.equal(ui.track.animation.frames[1].transform, "translateY(-44px)");
  assert.equal(ui.track.animation.options.duration, 450);
  ui.track.animation.finish();
  await pending;
  assert.equal(ui.track.children.length, 1);
}
await advance();
assert.equal(ui.row.attributes.get("aria-label"), "둘째 공지");
ui.row.dispatchEvent(new Event("click"));
assert.equal(ui.dialog.selectors.get("h2").textContent, "둘째 공지");
assert.match(ui.content.innerHTML, /둘째 내용/);
assert.match(ui.content.innerHTML, /https:\/\/example.com/);
ui.dialog.open = false;
await advance();
assert.equal(ui.row.attributes.get("aria-label"), "첫 공지", "The last notice rolls upward to the first");
ui.play.dispatchEvent(new Event("click"));
assert.equal(ui.play.textContent, "재생");
await [...ui.intervals.values()][0]();
assert.equal(ui.row.attributes.get("aria-label"), "첫 공지");
ui.play.dispatchEvent(new Event("click"));
for (const reason of ["hover", "focused"]) {
  ui.news[reason] = true;
  await [...ui.intervals.values()][0]();
  assert.equal(ui.row.attributes.get("aria-label"), "첫 공지");
  ui.news[reason] = false;
}
ui.motion.matches = true;
ui.motion.dispatchEvent(new Event("change"));
assert.equal(ui.play.textContent, "재생", "Reduced motion stops autoplay");
ui.all.dispatchEvent(new Event("click"));
assert.match(ui.content.innerHTML, /첫 내용/);
assert.match(ui.content.innerHTML, /둘째 내용/);
await ui.context.bind(ui.root);
assert.equal(ui.intervals.size, 1, "Rerendering leaves one timer and removes old listeners");
assert.equal(ui.reads(), 1, "Changing subjects reuses the page's notice request");
await ui.context.bind({ querySelector: () => null });
assert.equal(ui.intervals.size, 0);
const empty = await widget([]);
assert.equal(empty.host.hidden, true);
assert.equal(empty.intervals.size, 0);
const single = await widget(fixtures.slice(0, 1));
assert.equal(single.host.hidden, false);
assert.equal(single.intervals.size, 0);
console.log("Notice rolling direction, wraparound, pause, reduced motion, article links and cleanup checks passed.");
for (const value of [{ title: " ", body: "내용" }, { title: "x".repeat(121), body: "내용" }, { title: "제목", body: "x".repeat(5001) }, { title: "제목", body: "내용", link: "javascript:alert(1)" }, { title: "제목", body: "내용", link: {} }]) {
  assert.throws(() => validateNoticeInput(value));
}
assert.equal(safeNoticeLink("https://example.com/?a=1&b=2"), "https://example.com/?a=1&b=2");
const html = renderNoticeArticle({ title: '<img onerror="bad">', body: '<script>bad()</script>\n둘째 줄', link: "javascript:bad()", created_at: "2026-10-08T00:00:00Z" });
assert.doesNotMatch(html, /<script>|<img|href=/);
assert.match(html, /&lt;script&gt;/);
assert.match(renderNoticeArticle({ title: "제목", body: "내용", link: "https://example.com", created_at: "2026-10-08T00:00:00Z" }), /rel="noopener noreferrer"/);

const savedFetch = globalThis.fetch;
const savedEnv = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY, DORMS_SITE_URL: process.env.DORMS_SITE_URL, NODE_ENV: process.env.NODE_ENV };
Object.assign(process.env, { SUPABASE_URL: "https://notices-test.supabase.co", SUPABASE_SECRET_KEY: "test-secret", DORMS_SITE_URL: "https://booong.vercel.app", NODE_ENV: "production" });
const { publicKey, privateKey } = await generateKeyPair("RS256");
const key = { ...await exportJWK(publicKey), kid: "notices-test", alg: "RS256", use: "sig" };
const rows = [];
let reads = 0, writes = 0, available = true;
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input);
  if (url.hostname === "www.googleapis.com") return Response.json({ keys: [key] });
  if (url.hostname === "docs.google.com") {
    assert.equal(url.searchParams.get("gid"), new URL(MEMBER_PROFILE_SHEET_URL).searchParams.get("gid"));
    return new Response("id,admin\nDo,admin@example.com\n");
  }
  assert.equal(url.origin, "https://notices-test.supabase.co");
  assert.equal(url.pathname, "/rest/v1/booong_notices");
  assert.equal(options.headers.apikey, "test-secret");
  assert.equal(options.cache, "no-store");
  if (!available) return Response.json({}, { status: 503 });
  if (options.method === "GET") {
    reads++;
    assert.equal(url.searchParams.get("order"), "created_at.desc,id.desc");
    return Response.json(rows.filter(row => url.searchParams.get("published") !== "eq.true" || row.published));
  }
  writes++;
  const body = JSON.parse(options.body);
  if (options.method === "POST") {
    const row = { id: "11111111-1111-4111-8111-111111111111", published: true, created_at: new Date().toISOString(), ...body };
    rows.unshift(row);
    return Response.json([row]);
  }
  assert.equal(options.method, "PATCH");
  const row = rows.find(row => `eq.${row.id}` === url.searchParams.get("id") && `eq.${row.updated_at}` === url.searchParams.get("updated_at"));
  if (!row) return Response.json([]);
  Object.assign(row, body);
  return Response.json([row]);
};

try {
  const { default: handler } = await import("../api/notices.js");
  async function token(email = "admin@example.com", provider = "google.com") {
    return new SignJWT({ email, email_verified: true, auth_time: Math.floor(Date.now() / 1000), firebase: { sign_in_provider: provider } })
      .setProtectedHeader({ alg: "RS256", kid: "notices-test" }).setSubject("test-user")
      .setAudience("yadoran-2025").setIssuer("https://securetoken.google.com/yadoran-2025")
      .setIssuedAt().setExpirationTime("5m").sign(privateKey);
  }
  const valid = await token();
  async function request(method = "GET", body, identity, url = "/api/notices", origin = "https://booong.vercel.app") {
    const headers = new Map();
    const res = { setHeader(name, value) { headers.set(name, value); }, end(body) { this.body = JSON.parse(body); } };
    await handler({ method, body, url, headers: { host: "booong.vercel.app", origin, ...(identity ? { authorization: `Bearer ${identity}` } : {}) } }, res);
    assert.equal(headers.get("Cache-Control"), "no-store");
    return res;
  }
  assert.deepEqual((await request()).body.notices, []);
  assert.equal((await request("GET", undefined, undefined, "/api/notices?admin=1")).statusCode, 401);
  const value = { title: "첫 공지", body: "내용\n둘째 줄", link: "https://example.com" };
  for (const identity of [undefined, "forged", await token("other@example.com"), await token("admin@example.com", "password")]) {
    assert.ok([401, 403].includes((await request("POST", value, identity)).statusCode));
  }
  assert.equal(writes, 0);
  assert.equal((await request("POST", value, valid, "/api/notices", "https://evil.example")).statusCode, 403);
  assert.equal((await request("POST", { ...value, link: "javascript:alert(1)" }, valid)).statusCode, 400);
  assert.equal((await request("POST", { ...value, published: "true" }, valid)).statusCode, 400);
  assert.equal((await request("POST", "{broken", valid)).statusCode, 400);
  const created = await request("POST", value, valid);
  assert.equal(created.statusCode, 201);
  const original = created.body.notice;
  assert.equal((await request()).body.notices[0].title, "첫 공지");
  const edited = await request("PATCH", { ...original, title: "수정된 공지" }, valid);
  assert.equal(edited.statusCode, 200);
  assert.notEqual(edited.body.notice.updated_at, original.updated_at);
  assert.equal((await request("PATCH", { ...original, title: "덮어쓰기 시도" }, valid)).statusCode, 409);
  assert.equal(rows[0].title, "수정된 공지");
  const hidden = await request("PATCH", { ...edited.body.notice, published: false }, valid);
  assert.equal(hidden.statusCode, 200);
  assert.deepEqual((await request()).body.notices, []);
  assert.equal((await request("GET", undefined, valid, "/api/notices?admin=1")).body.notices[0].published, false);
  const restored = await request("PATCH", { ...hidden.body.notice, published: true }, valid);
  assert.equal(restored.statusCode, 200);
  assert.equal((await request()).body.notices.length, 1);
  assert.equal((await request("PATCH", { ...restored.body.notice, id: "../private" }, valid)).statusCode, 400);
  assert.equal((await request("DELETE", restored.body.notice, valid)).statusCode, 405);
  available = false;
  assert.equal((await request()).statusCode, 503);
  assert.equal((await request("PATCH", { ...restored.body.notice, title: "실패한 수정" }, valid)).statusCode, 503);
  assert.equal(rows[0].title, "수정된 공지");
  assert.ok(reads > 0 && writes > 0);
  console.log("Notice validation, public visibility, admin authentication, edits and conflict checks passed.");
} finally {
  globalThis.fetch = savedFetch;
  for (const [name, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
}
