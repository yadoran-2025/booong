import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudStore, WORKSHOP_CACHE_MS } from '../../lib/rice-basket/cloud-store.mjs';
import { ContentConflictError } from '../../lib/booong-content-storage.js';

function storage() {
  let data = { schemaVersion: 3, pages: [], sessions: [], surveys: [] }, version = 1;
  return createCloudStore({
    async read(path) {
      assert.equal(path, 'workshop');
      return { data: structuredClone(data), etag: String(version) };
    },
    async write(path, body, etag) {
      assert.equal(path, 'workshop');
      if (etag !== String(version)) {
        throw new ContentConflictError();
      }
      data = structuredClone(body);return { etag: String(++version) };
    },
  });
}

test('저장한 응답은 캐시를 비운 새 요청에서 복구한다', async () => {
  const db = storage(), first = await db.load();
  first.data.surveys.push({ id: 'survey1', responses: [{ answer: '실제 응답' }] });
  await db.save(first);
  assert.deepEqual((await db.load()).data, first.data);
  assert.equal(first.etag, '2');
});

test('100개 동시 조회와 3초 안의 반복 조회는 DB 요청 하나를 공유하고 응답 객체는 격리한다', async () => {
  let reads = 0, time = 0, release;
  const data = { schemaVersion: 3, pages: [{ id: 'page' }], sessions: [], surveys: [] };
  const db = createCloudStore({ read() { reads++; return new Promise(resolve => { release = () => resolve({ data, etag: 'one' }); }); } }, () => time);
  const pending = Array.from({ length: 100 }, () => db.load());
  assert.equal(reads, 1); release();
  const responses = await Promise.all(pending);
  responses[0].data.pages[0].id = 'unsaved-private-draft';
  assert.equal(responses[1].data.pages[0].id, 'page');
  assert.equal((await db.load()).data.pages[0].id, 'page');
  assert.equal(reads, 1);
  time = WORKSHOP_CACHE_MS;
  const next = db.load(); assert.equal(reads, 2); release(); await next;
  const fresh = db.load({ fresh: true }); assert.equal(reads, 3); release(); await fresh;
});

test('실패한 저장의 초안은 캐시에 섞이지 않고 충돌 뒤에는 DB를 다시 읽는다', async () => {
  let reads = 0;
  const data = { schemaVersion: 3, pages: [{ id: 'saved' }], sessions: [] };
  const db = createCloudStore({
    async read() { reads++; return { data, etag: 'current' }; },
    async write() { throw new ContentConflictError(); },
  });
  const draft = await db.load(); draft.data.pages[0].id = 'failed-draft';
  await assert.rejects(db.save(draft), ContentConflictError);
  assert.equal((await db.load()).data.pages[0].id, 'saved'); assert.equal(reads, 2);
});

test('저장 전에 시작된 느린 읽기가 완료돼도 저장 후 캐시를 되돌리지 않는다', async () => {
  let release;
  const old = { data: { schemaVersion: 3, pages: [{ id: 'old' }], sessions: [] }, etag: 'one' };
  let state = structuredClone(old), reads = 0;
  const db = createCloudStore({
    read() { reads++; return reads === 1 ? new Promise(resolve => { release = () => resolve(old); }) : Promise.resolve(structuredClone(state)); },
    async write(path, data) { state = { data: structuredClone(data), etag: 'two' }; return { etag: 'two' }; },
  });
  const slow = db.load();
  await db.save({ data: { ...old.data, pages: [{ id: 'new' }] }, etag: 'one' });
  assert.equal((await db.load()).data.pages[0].id, 'new');
  release(); assert.equal((await slow).data.pages[0].id, 'new');
  assert.equal((await db.load()).data.pages[0].id, 'new'); assert.equal(reads, 2);
});

test('일시적인 읽기 실패를 빈 데이터로 캐시하지 않는다', async () => {
  let reads = 0;
  const db = createCloudStore({ async read() { if (++reads === 1) throw new Error('offline'); return { data: { schemaVersion: 3, pages: [], sessions: [] }, etag: 'one' }; } });
  await assert.rejects(db.load(), /offline/);
  assert.equal((await db.load()).etag, 'one'); assert.equal(reads, 2);
});

test('동시에 읽은 다른 요청이 먼저 저장하면 덮어쓰지 않고 충돌을 반환한다', async () => {
  const db = storage();
  const [first, second] = await Promise.all([db.load(), db.load()]);
  first.data.pages.push({ id: 'first' });second.data.pages.push({ id: 'second' });
  await db.save(first);
  await assert.rejects(db.save(second), ContentConflictError);
  assert.deepEqual((await db.load()).data.pages, [{ id: 'first' }]);
});

test('저장소가 없거나 손상되었을 때 빈 자료로 덮어쓰지 않는다', async () => {
  for (const result of [{ data: null }, { data: { schemaVersion: 2 }, etag: '1' }]) {
    const db = createCloudStore({ read: async () => result, write: () => assert.fail('손상된 저장소를 쓰면 안 됨') });
    await assert.rejects(db.load());
  }
});
