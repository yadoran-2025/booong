import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mountTransferVisual } from '../../rice-basket/learning.js';

test('전후 버튼으로 건축과 수업의 그림·설명·접근성 상태를 함께 전환한다', () => {
  const node = () => ({ attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } });
  const buttons = [node(), node()], captions = [node(), node()], images = [node(), node()];
  const transfer = {
    dataset: {},
    querySelectorAll(selector) { return selector === 'button' ? buttons : selector === 'svg' ? images : captions; },
  };
  mountTransferVisual(transfer);
  assert.equal(transfer.dataset.mode, 'before');
  assert.deepEqual(buttons.map(button => button.attributes['aria-pressed']), ['true', 'false']);
  assert.match(captions[0].textContent, /구조벽/);
  assert.match(captions[1].textContent, /종이 응답/);
  buttons[1].onclick();
  assert.equal(transfer.dataset.mode, 'after');
  assert.deepEqual(buttons.map(button => button.attributes['aria-pressed']), ['false', 'true']);
  assert.match(captions[0].textContent, /철근콘크리트/);
  assert.match(captions[1].textContent, /코딩 에이전트/);
  assert.deepEqual(images.map(image => image.attributes['aria-label']), captions.map(caption => caption.textContent));
  buttons[0].onclick();
  assert.equal(transfer.dataset.mode, 'before');
  assert.match(images[0].attributes['aria-label'], /구조벽/);
  assert.match(images[1].attributes['aria-label'], /종이 응답/);
});
