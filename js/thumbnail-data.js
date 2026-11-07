import { lessonScreenshots } from "./lesson-thumbnails.js";

export const THUMBNAIL_WIDTH = 800;
export const THUMBNAIL_HEIGHT = 500;
export const THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;
export const THUMBNAIL_MIME_TYPE = "image/webp";
export const THUMBNAIL_QUALITY = 0.85;

export async function encodeThumbnail(canvas) {
  const image = await new Promise(resolve => canvas.toBlob(resolve, THUMBNAIL_MIME_TYPE, THUMBNAIL_QUALITY));
  if (!image || image.type !== THUMBNAIL_MIME_TYPE) throw new Error("WebP로 변환하지 못했습니다. 최신 Chrome 또는 Edge에서 다시 시도해주세요.");
  if (image.size > THUMBNAIL_MAX_BYTES) throw new Error("저장할 이미지가 2MB를 넘습니다. 더 작은 이미지를 선택해주세요.");
  return image;
}

export function thumbnailUrl(resource, record) {
  return record?.url || resource.thumbnailUrl || lessonScreenshots[resource.id] || "/assets/lesson-thumbnails/social-studies-default-v1.jpg";
}

export function thumbnailCrop(width, height, zoom = 1, x = 0.5, y = 0.5) {
  if (![width, height, zoom, x, y].every(Number.isFinite) || width <= 0 || height <= 0) throw new Error("이미지 크기를 확인해주세요.");
  const scale = Math.max(THUMBNAIL_WIDTH / width, THUMBNAIL_HEIGHT / height) * Math.max(1, Math.min(4, zoom));
  const sw = THUMBNAIL_WIDTH / scale, sh = THUMBNAIL_HEIGHT / scale;
  return { sx: (width - sw) * Math.max(0, Math.min(1, x)), sy: (height - sh) * Math.max(0, Math.min(1, y)), sw, sh };
}

export async function loadManagedThumbnails() {
  const response = await fetch("/api/lesson-thumbnails", { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("썸네일을 불러오지 못했습니다.");
  const data = await response.json();
  if (!data.thumbnails || typeof data.thumbnails !== "object" || Array.isArray(data.thumbnails)) throw new Error("썸네일 응답을 확인해주세요.");
  return data.thumbnails;
}
