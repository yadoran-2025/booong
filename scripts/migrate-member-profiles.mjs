import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { contentStorage } from "../lib/booong-content-storage.js";
import { MEMBER_PROFILE_SHEET_URL, normalizeMemberProfiles, parseMemberProfileCsv } from "../js/member-data.js";
import { readMemberProfiles } from "../lib/member-profile-store.js";

const args = process.argv.slice(2);
if (args.some(arg => !["--write", "--local"].includes(arg))) throw new Error("Usage: node --env-file=.env.local scripts/migrate-member-profiles.mjs [--local] [--write]");
const response = await fetch(MEMBER_PROFILE_SHEET_URL, { cache: "no-store", signal: AbortSignal.timeout(15000) });
if (!response.ok) throw new Error(`Member sheet ${response.status}`);
const data = { members: normalizeMemberProfiles({ members: parseMemberProfileCsv(await response.text()) }) };
assert.ok(data.members.length, "Refusing to import empty profiles");
console.log(`${data.members.length} profiles validated; administrator emails excluded.`);
if (args.includes("--write")) {
  if (args.includes("--local")) {
    await mkdir(".data", { recursive: true });
    await writeFile(".data/member-profiles.json", JSON.stringify(data), { flag: "wx", mode: 0o600 });
    assert.deepEqual(await readMemberProfiles({ file: ".data/member-profiles.json" }), data);
    console.log("Saved and verified .data/member-profiles.json");
  } else {
    await contentStorage.write("members", data, "null_etag");
    assert.deepEqual(await readMemberProfiles(), data);
    console.log("Imported and verified Firebase content/members");
  }
} else console.log("Dry run. Add --write to import; existing profiles will never be overwritten.");
