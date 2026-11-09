export function safeNoticeLink(value) {
  if (typeof value !== "string" || value.length > 2000 || /[\u0000-\u0020\u007f\\]/.test(value)) return "";
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}

export function validateNoticeInput(input) {
  const title = typeof input?.title === "string" ? input.title.trim() : "";
  const body = typeof input?.body === "string" ? input.body.trim() : "";
  const link = typeof input?.link === "string" ? input.link.trim() : "";
  if (!title || title.length > 120 || !body || body.length > 5000 || (input?.link !== undefined && typeof input.link !== "string") || (link && !safeNoticeLink(link))) {
    throw new Error("제목은 120자, 내용은 5,000자 이내로 입력하고 링크는 http 또는 https 주소를 사용해주세요.");
  }
  return { title, body, link: link ? safeNoticeLink(link) : "" };
}

export async function readNotices() {
  const response = await fetch("/api/notices", { credentials: "omit" });
  const result = await response.json();
  if (!response.ok || !Array.isArray(result.notices)) throw new Error("공지사항을 불러오지 못했습니다.");
  return result.notices;
}
