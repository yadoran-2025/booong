import { resolve } from "node:path";
import { readMemberProfileState, saveMemberProfile, MemberProfileError } from "./member-profile-store.js";
import { adminAccess } from "../api/admin.js";
import { isLoopbackRequest } from "./local-admin.js";
import { sendJson, siteOrigin } from "./dorms-auth.js";
import { cachePublicList, refreshPublicList } from "./public-list-cache.js";

const cacheTag = "booong-member-profiles";

export default async function handler(req, res) {
  res.setHeader("Vercel-CDN-Cache-Control", "no-store");
  if (!["GET", "POST"].includes(req.method)) return sendJson(res, 405, { error: "Method not allowed" });
  const query = new URL(req.url, "https://booong.invalid").searchParams;
  if ([...query.keys()].some(key => key !== "admin" || query.getAll(key).length !== 1) || (query.has("admin") && query.get("admin") !== "1") || (req.method === "POST" && query.size)) return sendJson(res, 400, { error: "요청 주소를 확인해주세요." });
  const manage = req.method === "POST" || query.has("admin");
  if (manage) {
    const access = await adminAccess(req);
    if (access.status !== 200) return sendJson(res, access.status, access.body);
  }
  const local = isLoopbackRequest(req);
  const options = local ? { file: resolve(".data/member-profiles.json") } : {};
  try {
    if (req.method === "GET") {
      const state = await readMemberProfileState(options);
      if (manage) return sendJson(res, 200, state);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      cachePublicList(res, cacheTag, local);
      res.statusCode = 200;
      res.end(JSON.stringify({ members: state.members }));
      return;
    }
    if (req.headers.origin !== (local ? `http://${req.headers.host}` : siteOrigin())) return sendJson(res, 403, { error: "Forbidden" });
    if (req.headers["content-type"] !== "application/json") return sendJson(res, 415, { error: "JSON 요청을 사용해주세요." });
    let size = 0; const chunks = [];
    if (Number(req.headers["content-length"]) > 64 * 1024) throw new MemberProfileError(413, "입력 내용이 너무 깁니다.");
    if (Buffer.isBuffer(req.body)) { size = req.body.length; chunks.push(req.body); }
    else for await (const chunk of req) { size += chunk.length; if (size > 64 * 1024) throw new MemberProfileError(413, "입력 내용이 너무 깁니다."); chunks.push(chunk); }
    if (size > 64 * 1024) throw new MemberProfileError(413, "입력 내용이 너무 깁니다.");
    let input;
    try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new MemberProfileError(400, "입력 내용을 확인해주세요."); }
    const state = await saveMemberProfile(input, options);
    const warning = await refreshPublicList(cacheTag, local);
    return sendJson(res, 200, { ...state, ...(warning ? { warning } : {}) });
  } catch (error) {
    return sendJson(res, error instanceof MemberProfileError ? error.status : 503, { error: error instanceof MemberProfileError ? error.message : "프로필을 불러오거나 저장하지 못했습니다. 잠시 후 다시 시도해주세요." });
  }
}
