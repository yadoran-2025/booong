export const WEB_APP_IMAGE_MAX_BYTES = 128 * 1024;

export function webAppThumbnailImage(value) {
  if (typeof value !== 'string' || value.length > 23 + 4 * Math.ceil(WEB_APP_IMAGE_MAX_BYTES / 3)
    || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('붙여넣은 이미지를 다시 확인해 주세요.');
  let bytes;
  try { bytes = atob(value.slice(23)); } catch { throw new Error('붙여넣은 이미지를 다시 확인해 주세요.'); }
  if (bytes.length > WEB_APP_IMAGE_MAX_BYTES || !bytes.startsWith('\xff\xd8\xff') || !bytes.endsWith('\xff\xd9')) throw new Error('붙여넣은 이미지를 다시 확인해 주세요.');
  return value;
}

export async function prepareWebAppThumbnail(file) {
  if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error('10MB 이하의 캡처 이미지를 붙여넣어 주세요.');
  const image = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');canvas.width = 800;canvas.height = 500;
    const context = canvas.getContext('2d');
    const scale = Math.min(canvas.width / image.width, canvas.height / image.height);
    const width = image.width * scale, height = image.height * scale;
    context.fillStyle = '#fff';context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    // shortcut: small captures stay in the existing private page store; use separate files if image volume grows.
    for (const quality of [0.85, 0.65, 0.45]) {
      const value = canvas.toDataURL('image/jpeg', quality);
      if (value.length <= 23 + 4 * Math.ceil(WEB_APP_IMAGE_MAX_BYTES / 3)) return webAppThumbnailImage(value);
    }
    throw new Error('이미지가 너무 복잡합니다. 필요한 부분만 캡처해 다시 붙여넣어 주세요.');
  } finally { image.close(); }
}
