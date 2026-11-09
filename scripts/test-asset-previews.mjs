import assert from 'node:assert/strict';
globalThis.document = { getElementById: () => ({}) };
const modules = await Promise.all([import('../js/asset-search/assets.js'), import('../js/author/assets.js')]);
for (const { getPreviewImageUrl } of modules) {
  for (const url of ['https://www.youtube.com/shorts/M_F7ioHYJ60?si=example', 'https://www.youtube.com/embed/M_F7ioHYJ60', 'https://www.youtube.com/watch?v=M_F7ioHYJ60', 'https://youtu.be/M_F7ioHYJ60']) {
    assert.equal(getPreviewImageUrl(url), 'https://img.youtube.com/vi/M_F7ioHYJ60/mqdefault.jpg');
  }
  assert.equal(getPreviewImageUrl('https://drive.google.com/file/d/example/view'), 'https://lh3.googleusercontent.com/d/example');
  assert.equal(getPreviewImageUrl('https://example.com/image.webp'), 'https://example.com/image.webp');
  assert.equal(getPreviewImageUrl(''), '');
}
console.log('Search and authoring previews use thumbnails for YouTube videos, including Shorts.');
