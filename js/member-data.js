import { parseCSV } from "./api.js";

export const MEMBER_PROFILE_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRqcg9kXgh8lcmeTO9xwQJKjqSQt6IotKtDHEbxj0YOpQ1V_TC3xSA3YoB4lcIr01g2FoiNapJfI8Wg/pub?gid=1259304881&single=true&output=csv";

const splitList = value => String(value || "")
  .split(/\s*(?:\||;|\r?\n)\s*/)
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
    bio: String(row.bio || "").trim(),
    making: splitList(row.making),
    homepage: String(row.homepage || "").trim(),
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

export async function loadMembers({ sheetUrl = MEMBER_PROFILE_SHEET_URL, fallbackUrl = `members.json?_=${Date.now()}` } = {}) {
  try {
    const sheetRes = await fetch(sheetUrl, { cache: "no-store" });
    if (sheetRes.ok) {
      const members = parseMemberProfileCsv(await sheetRes.text());
      if (members.length) return members;
    }
  } catch (error) {
    console.warn("Member profile sheet unavailable; using members.json:", error);
  }

  const fallbackRes = await fetch(fallbackUrl, { cache: "no-store" });
  if (!fallbackRes.ok) throw new Error(`members.json ${fallbackRes.status}`);
  const data = await fallbackRes.json();
  return Array.isArray(data.members) ? data.members.map(normalizeMemberRow).filter(Boolean) : [];
}
