import assert from 'node:assert/strict';
import { test } from 'node:test';
import { youtubeEmbed } from '../../rice-basket/learning.js';

test('건축 영상은 지정한 시점부터 임베드하고 다른 호스트는 거부한다', () => {
  assert.equal(youtubeEmbed('https://youtu.be/Ad-VWkbih1c?t=169'), 'https://www.youtube-nocookie.com/embed/Ad-VWkbih1c?start=169');
  assert.equal(youtubeEmbed('https://example.com/watch?v=Ad-VWkbih1c'), '');
});
