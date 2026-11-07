import test from 'node:test';
import assert from 'node:assert/strict';
import { parseResourceLinks, resourceUrl } from '../../rice-basket/learning.js';

test('소개 문장은 유지하고 안전한 링크만 표 데이터로 분리한다', () => {
  assert.deepEqual(parseResourceLinks('소개 문장\n\n자료 A | 한 줄 소개 | https://example.com/a\n자료 B | 설명 | http://example.com/b'), {
    intro: '소개 문장',
    links: [{ title: '자료 A', description: '한 줄 소개', url: 'https://example.com/a' }],
  });
});

test('주소 앞에 https://를 붙이고 다른 프로토콜은 거부한다', () => {
  assert.equal(resourceUrl('www.example.com/a'), 'https://www.example.com/a');
  assert.throws(() => resourceUrl('http://example.com'));
});
