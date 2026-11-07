import assert from 'node:assert/strict';
import { test } from 'node:test';
import { redBrickStudentUrl } from '../../rice-basket/learning.js';

test('학생 화면 연결 주소의 경매 채널·방·해시를 보존한다', () => {
  const address = 'https://yadoran-2025.github.io/red-brick/?student=1&display=class-channel&room=auction_class_save_1#auction';
  assert.equal(redBrickStudentUrl(` ${address} `), address);
});

test('교사 화면·다른 사이트·채널이 없는 주소는 학생 연결로 사용하지 않는다', () => {
  for (const address of [
    'javascript:alert(1)',
    'https://example.com/red-brick/?student=1&display=x',
    'https://yadoran-2025.github.io/other/?student=1&display=x',
    'https://yadoran-2025.github.io/red-brick/',
    'https://yadoran-2025.github.io/red-brick/?student=1',
    'https://yadoran-2025.github.io/red-brick/?student=1&display=%20',
    'https://user:password@yadoran-2025.github.io/red-brick/?student=1&display=x',
  ]) assert.throws(() => redBrickStudentUrl(address));
});
