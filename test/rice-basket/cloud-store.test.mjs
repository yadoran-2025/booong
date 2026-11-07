import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudStore } from '../../lib/rice-basket/cloud-store.mjs';
import { BlobPreconditionFailedError } from '@vercel/blob';

function storage() {
  let data = { schemaVersion: 3, pages: [], sessions: [], surveys: [] }, version = 1;
  return createCloudStore({
    async get(path, options) {
      assert.equal(path, 'workshop/store.json');
      assert.deepEqual(options, { access: 'private', useCache: false, headers: { 'accept-encoding': 'identity' } });
      return { statusCode: 200, stream: new Response(JSON.stringify(data)).body, blob: { etag: String(version) } };
    },
    async put(path, body, options) {
      assert.equal(path, 'workshop/store.json');
      assert.equal(options.access, 'private');
      assert.equal(options.addRandomSuffix, false);
      if (options.ifMatch !== String(version)) {
        throw new BlobPreconditionFailedError();
      }
      data = JSON.parse(body);return { etag: String(++version) };
    },
  });
}

test('비공개 저장소를 캐시 없이 읽고 저장한 응답을 새 요청에서 복구한다', async () => {
  const db = storage(), first = await db.load();
  first.data.surveys.push({ id: 'survey1', responses: [{ answer: '실제 응답' }] });
  await db.save(first);
  assert.deepEqual((await db.load()).data, first.data);
  assert.equal(first.etag, '2');
});

test('동시에 읽은 다른 요청이 먼저 저장하면 덮어쓰지 않고 충돌을 반환한다', async () => {
  const db = storage();
  const [first, second] = await Promise.all([db.load(), db.load()]);
  first.data.pages.push({ id: 'first' });second.data.pages.push({ id: 'second' });
  await db.save(first);
  await assert.rejects(db.save(second), BlobPreconditionFailedError);
  assert.deepEqual((await db.load()).data.pages, [{ id: 'first' }]);
});

test('저장소가 없거나 손상되었을 때 빈 자료로 덮어쓰지 않는다', async () => {
  for (const result of [null, { statusCode: 200, stream: new Response('{"schemaVersion":2}').body, blob: { etag: '1' } }]) {
    const db = createCloudStore({ get: async () => result, put: () => assert.fail('손상된 저장소를 쓰면 안 됨') });
    await assert.rejects(db.load());
  }
});
