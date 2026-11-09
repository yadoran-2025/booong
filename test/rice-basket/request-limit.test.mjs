import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Readable } from 'node:stream';
import { createRiceBasketHandler } from '../../api/rice-basket.js';
import { createHandler } from '../../lib/rice-basket/server.mjs';
import { createThumbnailRequestGuard } from '../../lib/thumbnail-reads.js';
import { createCloudStore } from '../../lib/rice-basket/cloud-store.mjs';
import { ContentConflictError } from '../../lib/booong-content-storage.js';

test('제한된 요청은 Firebase·인증에 도달하지 않고 입력 재시도 안내와 Retry-After를 반환한다', async () => {
  let calls = 0, time = 0;
  const handler = createRiceBasketHandler(async (req, res) => { calls++; res.end('{}'); }, createThumbnailRequestGuard(() => time, 2));
  async function request(ip = '192.0.2.1', url = '/api/rice-basket?route=/api/surveys') {
    const req = { method: 'GET', url, headers: {}, socket: { remoteAddress: ip } };
    const headers = {}; const res = { setHeader(key, value) { headers[key] = value; }, end(body) { this.body = JSON.parse(body); } };
    await handler(req, res); return { ...res, headers };
  }
  await request(); await request();
  const blocked = await request(); assert.equal(blocked.statusCode, 429); assert.equal(blocked.headers['Retry-After'], '60');
  assert.match(blocked.body.error, /입력은 유지/); assert.equal(calls, 2);
  await request('192.0.2.2'); assert.equal(calls, 3);
  time = 60_000; await request(); assert.equal(calls, 4);
  assert.equal((await request('192.0.2.3', '/api/rice-basket?route=/api/surveys&route=/api/admin')).statusCode, 404);
  assert.equal(calls, 4);
});

test('공개 GET만 캐시를 쓰고 참가자 저장 요청과 운영자 GET은 최신 상태를 읽는다', async () => {
  const options = [];
  const run = createHandler({ async load(input) { options.push(input); return { data: { pages: [], sessions: [] } }; } });
  async function request(method, url, admin = false) {
    const req = Object.assign(Readable.from([]), { method, url, headers: {}, riceBasketAdmin: admin });
    await run(req, { writeHead() {}, end() {} });
  }
  await request('GET', '/api/sessions/missing');
  await request('POST', '/api/sessions/missing/join');
  await request('GET', '/api/admin', true);
  assert.deepEqual(options, [{ fresh: false }, { fresh: true }, { fresh: true }]);
});

test('공개 조회 캐시는 비공개 답변을 노출하지 않고 공유 해제 직후에는 결과 접근을 막는다', async () => {
  let reads = 0, version = 1;
  const page = 'page-4a2b86a58156';
  let data = { schemaVersion: 3, pages: [{ id: page, sections: [] }], sessions: [{ id: 'training', pageIds: [page], participants: [], blocks: [] }], surveys: [{
    id: 'survey', sessionId: 'training', title: '설문', questions: [{ id: 'q', title: '질문', type: 'choice', required: true, options: ['A', 'B'] }],
    shareResults: true, responses: [{ tokenHash: 'PRIVATE_TOKEN', answers: { q: 'A' } }], revision: 1, version: 1,
  }] };
  const storage = createCloudStore({
    async read() { reads++; return { data: structuredClone(data), etag: String(version) }; },
    async write(record, next, etag) { if (etag !== String(version)) throw new ContentConflictError(); data = structuredClone(next); return { etag: String(++version) }; },
  });
  const run = createHandler(storage);
  async function request(url, method = 'GET', body, admin = false) {
    const req = Object.assign(Readable.from(body ? [JSON.stringify(body)] : []), { method, url, headers: {}, riceBasketAdmin: admin });
    let status, result;
    await run(req, { writeHead(value) { status = value; }, end(value) { result = JSON.parse(value); } });
    return { status, body: result };
  }
  const results = await Promise.all(Array.from({ length: 100 }, () => request('/api/surveys/survey/results?session=training')));
  assert.ok(results.every(result => result.status === 200)); assert.equal(reads, 1);
  assert.ok(!JSON.stringify(results).includes('PRIVATE_TOKEN'));
  assert.equal((await request('/api/surveys/survey?session=training', 'PATCH', { shareResults: false }, true)).status, 200);
  assert.equal((await request('/api/surveys/survey/results?session=training')).status, 403);
  assert.equal(reads, 3, '운영자 저장 전과 저장 뒤에는 최신 문서를 읽는다');
});
