import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { prepareWebAppThumbnail, webAppThumbnailImage, WEB_APP_IMAGE_MAX_BYTES } from '../../rice-basket/web-app-thumbnail.js';

const jpeg = readFileSync(new URL('../../assets/lesson-thumbnails/apps/group-2.jpg', import.meta.url));
const dataUrl = 'data:image/jpeg;base64,' + jpeg.toString('base64');

test('썸네일은 크기가 제한된 JPEG만 허용한다', () => {
  assert.equal(webAppThumbnailImage(dataUrl), dataUrl);
  for (const value of [null, {}, 'https://example.org/image.jpg', 'data:image/svg+xml;base64,PHN2Zy8+', 'data:image/jpeg;base64,YmFk', 'data:image/jpeg;base64,' + Buffer.alloc(WEB_APP_IMAGE_MAX_BYTES + 1).toString('base64')]) assert.throws(() => webAppThumbnailImage(value));
});

test('붙여넣은 캡처는 잘리지 않게 축소하고 용량을 줄인 뒤 비트맵을 해제한다', async t => {
  const previousDocument = globalThis.document, previousBitmap = globalThis.createImageBitmap;
  t.after(() => { globalThis.document = previousDocument;globalThis.createImageBitmap = previousBitmap; });
  let closed = false, draw, qualities = [];
  const image = { width: 1600, height: 1600, close() { closed = true; } };
  globalThis.createImageBitmap = async () => image;
  const canvas = { getContext: () => ({ fillRect() {}, drawImage(...args) { draw = args; } }), toDataURL(type, quality) { assert.equal(type, 'image/jpeg');qualities.push(quality);return quality === 0.85 ? 'x'.repeat(200_000) : dataUrl; } };
  globalThis.document = { createElement: () => canvas };
  assert.equal(await prepareWebAppThumbnail({ type: 'image/png', size: 1000 }), dataUrl);
  assert.equal(canvas.width, 800);assert.equal(canvas.height, 500);
  assert.deepEqual(draw, [image, 150, 0, 500, 500]);
  assert.deepEqual(qualities, [0.85, 0.65]);assert.equal(closed, true);
  canvas.toDataURL = () => { throw new Error('encode failed'); };closed = false;
  await assert.rejects(prepareWebAppThumbnail({ type: 'image/png', size: 1000 }), /encode failed/);assert.equal(closed, true);
  for (const file of [null, { type: 'image/svg+xml', size: 20 }, { type: 'image/png', size: 11 * 1024 * 1024 }]) await assert.rejects(prepareWebAppThumbnail(file));
});
