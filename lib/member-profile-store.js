import { readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { contentStorage, ContentConflictError } from "./booong-content-storage.js";
import { normalizeMemberProfiles, validateMemberProfileInput } from "../js/member-data.js";

export class MemberProfileError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const conflict = () => new MemberProfileError(409, "다른 곳에서 프로필을 수정했습니다. 입력한 내용을 복사한 뒤 새로고침해주세요.");
const revisionOf = bytes => createHash("sha256").update(bytes).digest("hex");

export async function readMemberProfileState({ file, storage = contentStorage } = {}) {
  let data, revision;
  if (file) {
    const bytes = await readFile(file);
    data = JSON.parse(bytes.toString("utf8"));
    revision = revisionOf(bytes);
  }
  else {
    const result = await storage.read("members");
    data = result.data;
    revision = result.etag;
  }
  if (typeof revision !== "string" || !revision) throw new Error("Member profile revision unavailable");
  return { members: normalizeMemberProfiles(data), revision };
}

export async function readMemberProfiles(options) {
  return { members: (await readMemberProfileState(options)).members };
}

export async function saveMemberProfile(input, options = {}) {
  if (!input || typeof input.revision !== "string" || !input.revision || input.revision.length > 200) throw new MemberProfileError(400, "수정 버전을 확인해주세요.");
  let patch;
  try { patch = validateMemberProfileInput(input.member); }
  catch (error) { throw new MemberProfileError(400, error.message); }
  const state = await readMemberProfileState(options);
  if (state.revision !== input.revision) throw conflict();
  if (!state.members.some(member => member.id === patch.id)) throw new MemberProfileError(404, "구성원을 찾지 못했습니다.");
  const members = state.members.map(member => member.id === patch.id ? { ...member, ...patch } : member);
  const body = JSON.stringify({ members });
  let revision;
  if (options.file) {
    // The synchronous compare/rename keeps concurrent local requests from losing edits.
    if (revisionOf(readFileSync(options.file)) !== state.revision) throw conflict();
    const temporary = `${options.file}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, body, { flag: "wx", mode: 0o600 });
      renameSync(temporary, options.file);
    } finally {
      try { unlinkSync(temporary); } catch (error) { if (error.code !== "ENOENT") throw error; }
    }
    revision = revisionOf(body);
  } else {
    try {
      const result = await (options.storage || contentStorage).write("members", { members }, state.revision);
      revision = result.etag;
    } catch (error) {
      if (error instanceof ContentConflictError) throw conflict();
      throw error;
    }
  }
  return { members, revision };
}
