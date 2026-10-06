import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { SignJWT, exportJWK, generateKeyPair } from "jose";

const clientId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";
const grantVersion = "33333333-3333-4333-8333-333333333333";
const { publicKey, privateKey } = await generateKeyPair("EdDSA", { extractable: true });
const jwk = { ...await exportJWK(publicKey), kid: "test", alg: "EdDSA", use: "sig" };
let authorizeUrl;
let revoked = false;
let unavailable = false;
let databaseUnavailable = false;
let picture = "https://images.example.test/teacher.png";
let teacherVerified = false;
const comments = [];

const provider = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  res.setHeader("Content-Type", "application/json");
  if (url.pathname.endsWith("/configuration")) return res.end(JSON.stringify({ active: true, scopes: ["openid", "profile"] }));
  if (url.pathname.endsWith("/jwks")) return res.end(JSON.stringify({ keys: [jwk] }));
  if (url.pathname.endsWith("/token")) {
    let body = "";
    for await (const chunk of req) body += chunk;
    const input = JSON.parse(body);
    assert.equal(input.redirect_uri, "http://localhost:3000/api/auth/dorms/callback");
    assert.equal(createHash("sha256").update(input.code_verifier, "ascii").digest("base64url"), authorizeUrl.searchParams.get("code_challenge"));
    const token = await new SignJWT({ nonce: authorizeUrl.searchParams.get("nonce"), grant_version: grantVersion })
      .setProtectedHeader({ alg: "EdDSA", kid: "test" })
      .setIssuer("https://dorms.school").setAudience(clientId).setSubject(memberId)
      .setIssuedAt().setExpirationTime("10m").setJti("test-login")
      .sign(privateKey);
    return res.end(JSON.stringify({ id_token: token }));
  }
  if (url.pathname.endsWith("/userinfo")) {
    if (unavailable) { res.statusCode = 503; return res.end(JSON.stringify({ reason: "temporarily_unavailable" })); }
    if (revoked) { res.statusCode = 403; return res.end(JSON.stringify({ reason: "access_denied" })); }
    return res.end(JSON.stringify({ sub: memberId, name: "테스트 회원", picture, teacher_verified: teacherVerified, dorms: 0 }));
  }
  res.statusCode = 404;
  res.end("{}");
});
await new Promise(resolve => provider.listen(0, "localhost", resolve));

const database = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  res.setHeader("Content-Type", "application/json");
  if (req.headers.apikey !== "test-secret" || url.pathname !== "/rest/v1/lesson_comments") { res.statusCode = 403; return res.end("{}"); }
  if (databaseUnavailable) { res.statusCode = 503; return res.end("{}"); }
  const matches = comment => [...url.searchParams].every(([key, value]) =>
    ["select", "order", "limit"].includes(key) || (value === "is.null" ? comment[key] == null : `eq.${comment[key]}` === value));
  if (req.method === "GET" || req.method === "HEAD") {
    const rows = comments.filter(matches);
    res.setHeader("Content-Range", `*/${rows.length}`);
    return res.end(req.method === "HEAD" ? "" : JSON.stringify(rows));
  }
  let raw = "";
  for await (const chunk of req) raw += chunk;
  if (req.method === "PATCH") {
    const rows = comments.filter(matches);
    rows.forEach(comment => Object.assign(comment, JSON.parse(raw)));
    return res.end(JSON.stringify(rows));
  }
  const comment = { ...JSON.parse(raw), id: `0000000${comments.length + 4}-4444-4444-8444-444444444444`, created_at: "2026-09-28T00:00:00Z", edited_at: null, deleted_at: null };
  comments.unshift(comment);
  res.statusCode = 201;
  res.end(JSON.stringify([comment]));
});
await new Promise(resolve => database.listen(0, "localhost", resolve));

process.env.NODE_ENV = "test";
process.env.DORMS_API_ORIGIN_DEV = `http://localhost:${provider.address().port}`;
process.env.DORMS_CLIENT_ID = clientId;
process.env.DORMS_SITE_URL = "https://booong.vercel.app";
process.env.SUPABASE_URL = `http://localhost:${database.address().port}`;
process.env.SUPABASE_SECRET_KEY = "test-secret";

const { callbackUrl, safeNext } = await import("../lib/dorms-auth.js");
const { default: start } = await import("../api/auth/dorms/start.js");
const { default: callback } = await import("../api/auth/dorms/callback.js");
const { default: session } = await import("../api/auth/dorms/session.js");
const { default: logout } = await import("../api/auth/dorms/logout.js");
const { default: commentApi } = await import("../api/comments.js");
const { default: textbookApi } = await import("../api/textbooks.js");

function response() {
  const headers = new Map();
  return {
    statusCode: 200, body: "", headers,
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    end(value = "") { this.body = value; },
  };
}

try {
  assert.equal(safeNext("//evil.example/path"), "/");
  assert.equal(safeNext("/index.html?view=favorites"), "/index.html?view=favorites");
  const textbookNext = "/textbook-analysis.html?book=visang-social2-2015&unit=8&chapter=3";
  assert.equal(safeNext(textbookNext), textbookNext);
  assert.equal(callbackUrl(), "https://booong.vercel.app/api/auth/dorms/callback");
  assert.equal(callbackUrl("localhost:3000"), "http://localhost:3000/api/auth/dorms/callback");

  const noSession = response();
  await session({ method: "GET", headers: {} }, noSession);
  assert.equal(noSession.statusCode, 401);
  const publicRead = response();
  await commentApi({ method: "GET", url: "/api/comments?resourceId=lesson-1", headers: {} }, publicRead);
  assert.deepEqual(JSON.parse(publicRead.body), { comments: [], count: 0 });
  const publicCount = response();
  await commentApi({ method: "GET", url: "/api/comments?resourceId=lesson-1&countOnly=1", headers: {} }, publicCount);
  assert.deepEqual(JSON.parse(publicCount.body), { count: 0 });
  const noCommentSession = response();
  await commentApi({ method: "POST", headers: { host: "localhost:3000", origin: "http://localhost:3000" }, body: { resourceId: "lesson-1", text: "안녕하세요" } }, noCommentSession);
  assert.equal(noCommentSession.statusCode, 401);

  const begun = response();
  await start({ method: "POST", url: "/api/auth/dorms/start?next=%2Findex.html%3Fview%3Dfavorites", headers: { host: "localhost:3000" } }, begun);
  assert.equal(begun.statusCode, 302);
  authorizeUrl = new URL(begun.headers.get("location"));
  const flowCookie = begun.headers.get("set-cookie").split(";")[0];
  assert.equal(authorizeUrl.searchParams.get("code_challenge_method"), "S256");

  const badState = response();
  await callback({ method: "GET", url: "/api/auth/dorms/callback?code=ok&state=wrong", headers: { cookie: flowCookie } }, badState);
  assert.equal(badState.statusCode, 302);
  assert.match(badState.headers.get("location"), /reason=authentication_required/);

  const finished = response();
  await callback({ method: "GET", url: `/api/auth/dorms/callback?code=ok&state=${authorizeUrl.searchParams.get("state")}`, headers: { cookie: flowCookie, host: "localhost:3000" } }, finished);
  assert.equal(finished.statusCode, 302);
  assert.equal(finished.headers.get("location"), "http://localhost:3000/index.html?view=favorites");
  const sessionCookie = finished.headers.get("set-cookie")[1].split(";")[0];

  const allowed = response();
  await session({ method: "GET", headers: { cookie: sessionCookie } }, allowed);
  assert.equal(allowed.statusCode, 200);
  assert.deepEqual(JSON.parse(allowed.body), { id: memberId, name: "테스트 회원", picture });
  const textbookQuery = `/api/textbooks?${new URLSearchParams({ book: "visang-social2-2015", unit: "사회2[15개정]::VIII. 사람이 만든 삶터, 도시", chapter: "2" })}`;
  const textbookRequest = { method: "GET", url: textbookQuery, headers: { cookie: sessionCookie } };
  const anonymousBook = response();
  await textbookApi({ ...textbookRequest, headers: {} }, anonymousBook);
  assert.equal(anonymousBook.statusCode, 401);
  const unverifiedBook = response();
  await textbookApi(textbookRequest, unverifiedBook);
  assert.equal(unverifiedBook.statusCode, 401, "DoRms sessions do not authorize admin tools");
  assert.equal(unverifiedBook.headers.has("location"), false);
  teacherVerified = true;
  const teacherBook = response();
  await textbookApi(textbookRequest, teacherBook);
  assert.equal(teacherBook.statusCode, 401, "A verified DoRms teacher still needs Google admin login");
  assert.equal(teacherBook.headers.has("location"), false);
  teacherVerified = false;
  picture = "javascript:alert(1)";
  const invalidPicture = response();
  await session({ method: "GET", headers: { cookie: sessionCookie } }, invalidPicture);
  assert.equal(JSON.parse(invalidPicture.body).picture, null);
  picture = "https://images.example.test/teacher.png";
  const written = response();
  const commentRequest = { method: "POST", headers: { host: "localhost:3000", origin: "http://localhost:3000", cookie: sessionCookie }, body: { resourceId: "lesson-1", text: "좋은 수업" } };
  await commentApi(commentRequest, written);
  assert.equal(written.statusCode, 201);
  assert.equal(JSON.parse(written.body).comment.text, "좋은 수업");
  assert.equal(JSON.parse(written.body).comment.picture, picture);
  assert.equal(comments[0].author_sub, memberId);
  assert.equal(comments[0].author_picture, picture);
  assert.equal(comments[0].kind, "comment");
  assert.equal("kind" in JSON.parse(written.body).comment, false);
  const sharedRead = response();
  await commentApi({ method: "GET", url: "/api/comments?resourceId=lesson-1", headers: {} }, sharedRead);
  assert.equal(JSON.parse(sharedRead.body).comments[0].name, "테스트 회원");
  assert.equal(JSON.parse(sharedRead.body).comments[0].picture, picture);
  assert.equal(JSON.parse(sharedRead.body).count, 1);
  assert.equal(JSON.stringify(sharedRead.body).includes(memberId), false);

  const rootId = JSON.parse(written.body).comment.id;
  const replyRequest = { ...commentRequest, body: { resourceId: "lesson-1", parentId: rootId, text: "동의합니다" } };
  const reply = response();
  await commentApi(replyRequest, reply);
  assert.equal(reply.statusCode, 201);
  const replyId = JSON.parse(reply.body).comment.id;
  assert.equal(JSON.parse(reply.body).comment.parentId, rootId);

  const nested = response();
  await commentApi({ ...replyRequest, body: { ...replyRequest.body, parentId: replyId } }, nested);
  assert.equal(nested.statusCode, 400);
  assert.equal(comments.length, 2);

  const edit = response();
  await commentApi({ ...commentRequest, method: "PATCH", body: { resourceId: "lesson-1", commentId: replyId, text: "수정한 답글" } }, edit);
  assert.equal(edit.statusCode, 200);
  assert.equal(JSON.parse(edit.body).comment.text, "수정한 답글");
  assert.ok(JSON.parse(edit.body).comment.editedAt);

  comments[0].author_sub = "99999999-9999-4999-8999-999999999999";
  const otherAuthor = response();
  await commentApi({ ...commentRequest, method: "DELETE", body: { resourceId: "lesson-1", commentId: replyId } }, otherAuthor);
  assert.equal(otherAuthor.statusCode, 404);
  assert.equal(comments[0].deleted_at, null);
  comments[0].author_sub = memberId;

  const deleted = response();
  await commentApi({ ...commentRequest, method: "DELETE", body: { resourceId: "lesson-1", commentId: rootId } }, deleted);
  assert.equal(deleted.statusCode, 200);
  assert.equal(JSON.parse(deleted.body).comment.deleted, true);
  assert.equal(JSON.parse(deleted.body).comment.text, "");
  assert.equal(comments.find(item => item.id === rootId).body, "삭제된 댓글");
  assert.equal(comments.find(item => item.id === rootId).author_picture, null);

  const threadedRead = response();
  await commentApi({ method: "GET", url: "/api/comments?resourceId=lesson-1&viewer=1", headers: { cookie: sessionCookie } }, threadedRead);
  const thread = JSON.parse(threadedRead.body);
  assert.equal(thread.count, 1);
  assert.equal(thread.comments.find(item => item.id === rootId).name, "삭제된 댓글");
  assert.equal(thread.comments.find(item => item.id === replyId).mine, true);

  const deletedParent = response();
  await commentApi(replyRequest, deletedParent);
  assert.equal(deletedParent.statusCode, 400);

  revoked = true;
  const denied = response();
  await session({ method: "GET", headers: { cookie: sessionCookie } }, denied);
  assert.equal(denied.statusCode, 403);
  const deniedComment = response();
  await commentApi(commentRequest, deniedComment);
  assert.equal(deniedComment.statusCode, 403);
  assert.equal(comments.length, 2);

  revoked = false;
  unavailable = true;
  const downSession = response();
  await session({ method: "GET", headers: { cookie: sessionCookie } }, downSession);
  assert.equal(downSession.statusCode, 503);
  assert.equal(JSON.parse(downSession.body).reason, "temporarily_unavailable");
  const downComment = response();
  await commentApi(commentRequest, downComment);
  assert.equal(downComment.statusCode, 503);
  assert.equal(comments.length, 2);
  unavailable = false;
  databaseUnavailable = true;
  const downRead = response();
  await commentApi({ method: "GET", url: "/api/comments?resourceId=lesson-1", headers: {} }, downRead);
  assert.equal(downRead.statusCode, 503);
  databaseUnavailable = false;

  const badLogout = response();
  await logout({ method: "POST", headers: { origin: "https://evil.example" } }, badLogout);
  assert.equal(badLogout.statusCode, 403);
  const goodLogout = response();
  await logout({ method: "POST", headers: { host: "localhost:3000", origin: "http://localhost:3000", "sec-fetch-site": "same-origin" } }, goodLogout);
  assert.equal(goodLogout.statusCode, 200);
  assert.match(goodLogout.headers.get("set-cookie")[0], /Max-Age=0/);
  console.log("DoRms login, shared comments, revocation, outage, and logout checks passed.");
} finally {
  provider.close();
  database.close();
}
