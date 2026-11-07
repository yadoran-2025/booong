import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const app = readFileSync(new URL('../../rice-basket/red-brick/app.js', import.meta.url), 'utf8');
const demo = readFileSync(new URL('../../rice-basket/red-brick/demo-data.js', import.meta.url), 'utf8');
const context = vm.createContext({});
vm.runInContext(app.slice(0, app.indexOf('function switchTab(')) + demo, context);

function storage() {
  const entries = new Map();
  return { entries, getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
}

test('새 방문자에게 반별 예시를 제공하며 금액·보유 재료·재고가 낙찰 내역과 일치한다', () => {
  const saved = storage();
  context.seedDemoSessions(saved);
  const examples = [...saved.entries.values()].map(JSON.parse);
  assert.deepEqual(examples.map(item => item.teams.length), [4, 5, 6]);
  for (const example of examples) {
    assert.match(example.slotName, /예시/);
    assert.equal(example.logs.length, example.saleHistory.length);
    assert.ok(example.materials[example.curIdx].soldCount < example.materials[example.curIdx].stock);
    for (const team of example.teams) {
      const sales = example.saleHistory.filter(sale => sale.teamName === team.name);
      assert.equal(team.money, 20 - sales.reduce((sum, sale) => sum + sale.price, 0));
      assert.ok(team.money >= 0 && team.money <= 20);
      for (const material of example.materials) {
        assert.equal(team.items[material.id] || 0, sales.filter(sale => sale.matId === material.id).reduce((sum, sale) => sum + sale.qty, 0));
      }
    }
    for (const material of example.materials) {
      assert.equal(material.soldCount, example.saleHistory.filter(sale => sale.matId === material.id).reduce((sum, sale) => sum + sale.qty, 0));
      assert.ok(material.soldCount <= material.stock);
    }
  }
  const late = examples[1];
  const winners = late.teams.filter(team => late.materials.every(material => (team.items[material.id] || 0) >= material.missionNeed));
  assert.equal(winners.length, 3);
  const anotherVisitor = storage();
  context.seedDemoSessions(anotherVisitor);
  assert.deepEqual([...anotherVisitor.entries], [...saved.entries]);
});

test('기존 수업과 사용자가 진행한 예시는 다시 방문해도 덮어쓰지 않는다', () => {
  const saved = storage();
  saved.setItem('auction_class_save_1반', '기존 수업');
  context.seedDemoSessions(saved);
  saved.setItem('auction_class_save_1반 (예시)', '사용자가 이어서 진행한 예시');
  context.seedDemoSessions(saved);
  assert.equal(saved.entries.size, 4);
  assert.equal(saved.getItem('auction_class_save_1반'), '기존 수업');
  assert.equal(saved.getItem('auction_class_save_1반 (예시)'), '사용자가 이어서 진행한 예시');
});
