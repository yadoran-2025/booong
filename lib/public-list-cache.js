import { dangerouslyDeleteByTag } from "@vercel/functions";

export const PUBLIC_LIST_CACHE_SECONDS = 3600;
export const CATALOG_CACHE_TAG = "booong-lesson-catalog";
export const THUMBNAIL_LIST_CACHE_TAG = "booong-thumbnail-list";

export function cachePublicList(res, tag, local) {
  res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  res.setHeader("Vercel-CDN-Cache-Control", `max-age=${local ? 30 : PUBLIC_LIST_CACHE_SECONDS}`);
  res.setHeader("Vercel-Cache-Tag", tag);
}

export async function refreshPublicList(tag, local) {
  if (local) return;
  try {
    await dangerouslyDeleteByTag(tag, { revalidationDeadlineSeconds: 0 });
  } catch (error) {
    console.error("Public list cache refresh failed", tag, error.name);
    return "저장은 완료됐지만 공개 목록 갱신이 지연되고 있습니다. 최대 1시간 뒤 반영됩니다.";
  }
}
