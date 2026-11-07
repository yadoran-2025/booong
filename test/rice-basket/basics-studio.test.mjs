import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeTickets } from '../../rice-basket/learning.js';

test('교사 화면은 저장된 응답만 이해도별로 집계한다', () => {
  assert.deepEqual(summarizeTickets([
    { level: 0 }, { level: 2 }, { level: 2 }, { level: -1 }, { level: 3 },
  ]), [1, 0, 2]);
});
