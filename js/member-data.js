import { parseCSV } from "./api.js";

export const MEMBER_PROFILE_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRqcg9kXgh8lcmeTO9xwQJKjqSQt6IotKtDHEbxj0YOpQ1V_TC3xSA3YoB4lcIr01g2FoiNapJfI8Wg/pub?gid=1259304881&single=true&output=csv";

export const MEMBER_PROFILE_FIELD_LIMITS = { name: 120, interests: 2000, bio: 10000, career: 10000, trainingCareer: 10000, making: 10000, aliases: 2000 };
export const MEMBER_FEATURED_WORK_LIMIT = 3;

export function memberFeaturedWorks(member, works) {
  if (!Array.isArray(member.featuredWorkIds)) return [...works].sort((a, b) => a.type === b.type ? 0 : a.type === 'game' ? 1 : -1).slice(0, MEMBER_FEATURED_WORK_LIMIT);
  const available = new Map(works.map(work => [`${work.type}:${work.id}`, work]));
  return [...new Set(member.featuredWorkIds)].slice(0, MEMBER_FEATURED_WORK_LIMIT).flatMap(id => available.has(id) ? [available.get(id)] : []);
}

export function validateMemberProfileInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || typeof input.id !== "string" || !input.id.trim() || input.id.length > 80
    || Object.keys(input).some(key => !["id", "featuredWorkIds"].includes(key) && !Object.hasOwn(MEMBER_PROFILE_FIELD_LIMITS, key))) throw new Error("구성원 정보를 확인해주세요.");
  const member = { id: input.id.trim() };
  if (Object.hasOwn(input, "featuredWorkIds")) {
    if (!Array.isArray(input.featuredWorkIds) || input.featuredWorkIds.length > MEMBER_FEATURED_WORK_LIMIT
      || input.featuredWorkIds.some(id => typeof id !== "string" || id.length > 200 || !/^(lesson|game):[^\r\n\x00-\x1f]+$/.test(id))
      || new Set(input.featuredWorkIds).size !== input.featuredWorkIds.length) throw new Error("대표 콘텐츠는 최대 3개까지 선택해주세요.");
    member.featuredWorkIds = [...input.featuredWorkIds];
  }
  for (const [key, max] of Object.entries(MEMBER_PROFILE_FIELD_LIMITS)) {
    if (["aliases", "trainingCareer", "making"].includes(key) && !Object.hasOwn(input, key)) continue;
    if (typeof input[key] !== "string" || input[key].length > max) throw new Error("입력 내용과 길이를 확인해주세요.");
    member[key] = ["aliases", "career", "trainingCareer", "making"].includes(key)
      ? input[key].split(/\r?\n/).map(value => value.trim()).filter(Boolean) : input[key].trim();
  }
  if (!member.name) throw new Error("이름을 입력해주세요.");
  return member;
}

const splitList = value => (Array.isArray(value) ? value : String(value || "").split(/\s*(?:\||;|\r?\n)\s*/))
  .map(item => item.trim())
  .filter(Boolean);

export function normalizeMemberRow(row) {
  const member = {
    id: String(row.id || "").trim(),
    name: String(row.name || row.id || "").trim(),
    aliases: splitList(row.aliases),
    avatar: String(row.avatar || "").trim(),
    interests: String(row.interests || "").trim(),
    career: splitList(row.career),
    trainingCareer: splitList(row.trainingCareer ?? row["세부 연수경력"]),
    bio: String(row.bio || "").trim(),
    making: splitList(row.making),
    homepage: String(row.homepage || "").trim(),
    ...(Array.isArray(row.featuredWorkIds) ? { featuredWorkIds: [...row.featuredWorkIds] } : {}),
  };
  return member.id ? member : null;
}

export function parseMemberProfileCsv(text) {
  const rows = parseCSV(String(text || ""));
  if (rows.length < 2) return [];
  const headers = rows[0].map(header => String(header || "").replace(/^\uFEFF/, "").trim().toLowerCase());
  return rows.slice(1)
    .map(values => normalizeMemberRow(Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])) ))
    .filter(Boolean);
}

export function normalizeMemberProfiles(data) {
  if (!Array.isArray(data?.members)) throw new Error("Invalid member profiles");
  const ids = new Set();
  return data.members.map(row => {
    if (!row || typeof row !== "object" || typeof row.id !== "string") throw new Error("Invalid member profile");
    const member = normalizeMemberRow(row);
    if (!member || ids.has(member.id.toLowerCase())) throw new Error("Missing or duplicate member ID");
    ids.add(member.id.toLowerCase());
    return member;
  });
}

export async function loadMembers({ url = "/api/members", fallbackUrl = `members.json?_=${Date.now()}` } = {}) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Member profiles ${response.status}`);
    return normalizeMemberProfiles(await response.json());
  } catch (error) {
    console.warn("Member profiles unavailable; using members.json:", error);
  }

  const fallbackRes = await fetch(fallbackUrl, { cache: "no-store" });
  if (!fallbackRes.ok) throw new Error(`members.json ${fallbackRes.status}`);
  const data = await fallbackRes.json();
  return normalizeMemberProfiles(data);
}
