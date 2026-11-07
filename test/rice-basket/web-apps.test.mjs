import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import QRCode from 'qrcode';
import { createHandler } from '../../lib/rice-basket/server.mjs';
import { WEB_APPS_PAGE_ID, webAppDefinitions, webAppThumbnailUrl } from '../../rice-basket/web-app-config.js';

const entry = { title: ' 같이 실습 ', teacherUrl: 'https://example.org/teacher?room=class1#dashboard', studentUrl: 'https://example.org/student?room=class1&channel=social#join' };

test('자동 썸네일은 공개 시작 주소만 전달하고 교사 방 경로·쿼리·해시를 제외한다', () => {
  const thumbnail = webAppThumbnailUrl(entry.teacherUrl);
  assert.equal(thumbnail, 'https://image.thum.io/get/width/1200/crop/750/noanimate/https://example.org/');
  for (const privatePart of ['teacher', 'room=', 'class1', '#dashboard']) assert.equal(thumbnail.includes(privatePart), false);
  for (const invalid of ['', 'javascript:alert(1)', 'http://example.org', 'https://user:password@example.org/private', 'https://localhost', 'https://host.local', 'https://host.localhost', 'https://127.0.0.1', 'https://192.168.1.3', 'https://[::1]']) assert.equal(webAppThumbnailUrl(invalid), '');
});

test('웹앱 이름과 두 HTTPS URL을 검증하고 방·채널·해시를 보존한다', () => {
  assert.deepEqual(webAppDefinitions([entry]), [{ ...entry, title: '같이 실습' }]);
  assert.deepEqual(webAppDefinitions([]), []);
  assert.deepEqual(webAppDefinitions([{ ...entry, thumbnailUrl: '' }]), webAppDefinitions([entry]));
  const image = 'https://example.org/dashboard.jpg';
  assert.equal(webAppDefinitions([{ ...entry, thumbnailUrl: image }])[0].thumbnailUrl, image);
  for (const thumbnailUrl of ['javascript:alert(1)', 'data:image/png;base64,123', 'http://example.org/image.png', 'https://user:secret@example.org/image.png', {}]) assert.throws(() => webAppDefinitions([{ ...entry, thumbnailUrl }]));
  for (const bad of [null, {}, Array(21).fill(entry), [{ ...entry, title: '' }], [{ ...entry, title: '가'.repeat(121) }]]) assert.throws(() => webAppDefinitions(bad));
  for (const key of ['teacherUrl', 'studentUrl']) for (const url of ['javascript:alert(1)', 'data:text/html,test', 'http://example.org', 'https://user:secret@example.org', '', null, 'https://example.org/' + 'a'.repeat(2000)]) assert.throws(() => webAppDefinitions([{ ...entry, [key]: url }]));
});

test('운영자가 설정한 웹앱을 저장·복구하고 해당 연수 참가자에게 학생 URL QR만 제공한다', async t => {
  let data = { schemaVersion: 3, pages: [{ id: WEB_APPS_PAGE_ID, title: '웹앱 공유', content: '소개', sections: [] }, { id: 'other', title: '다른 내용', content: '유지', sections: [] }], sessions: [{ id: 'training', pageIds: [WEB_APPS_PAGE_ID], participants: [] }, { id: 'unrelated', pageIds: ['other'], participants: [] }] };
  const handler = createHandler({ load: async () => ({ data: structuredClone(data), etag: '1' }), save: async state => { data = structuredClone(state.data); } });
  const server = createServer((req, res) => { req.riceBasketAdmin = req.headers.authorization === 'Bearer owner';handler(req, res); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`, route = `/api/pages/${WEB_APPS_PAGE_ID}`;
  const patch = (body, owner = true, target = route) => fetch(base + target, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(owner ? { Authorization: 'Bearer owner' } : {}) }, body: JSON.stringify(body) });
  assert.equal((await patch({ webApps: [entry], webAppsRevision: 0 }, false)).status, 401);
  assert.equal((await patch({ webApps: [entry], webAppsRevision: 0 }, true, '/api/pages/other')).status, 400);
  assert.equal((await patch({ webApps: [{ ...entry, studentUrl: 'javascript:bad' }], webAppsRevision: 0 })).status, 400);
  const withImage = { ...entry, thumbnailUrl: 'https://example.org/dashboard.jpg' };
  const saved = await patch({ webApps: [withImage], webAppsRevision: 0 });assert.equal(saved.status, 200);
  assert.equal((await saved.json()).webAppsRevision, 1);
  assert.equal((await patch({ webApps: [], webAppsRevision: 0 })).status, 409);
  const page = await (await fetch(`${base}${route}?session=training`)).json();
  const studentApps = [{ title: '같이 실습', studentUrl: entry.studentUrl }];
  assert.deepEqual(page.webApps, studentApps);assert.equal(page.content, '소개');
  const session = await (await fetch(`${base}/api/sessions/training`)).json();
  assert.deepEqual(session.pages[0].webApps, studentApps);
  assert.equal(JSON.stringify(session).includes(entry.teacherUrl), false);
  const ownerPage = await (await fetch(base + route, { headers: { Authorization: 'Bearer owner' } })).json();
  assert.deepEqual(ownerPage.webApps, webAppDefinitions([withImage]));
  const qr = `${base}${route}/web-apps/0/qr`;
  assert.equal((await fetch(qr)).status, 401);
  assert.equal((await fetch(`${qr}?session=unrelated`)).status, 404);
  assert.equal((await fetch(`${base}${route}/web-apps/8/qr?session=training`)).status, 404);
  const response = await fetch(`${qr}?session=training`);assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/svg+xml');
  assert.equal(await response.text(), await QRCode.toString(entry.studentUrl, { type: 'svg', errorCorrectionLevel: 'M', margin: 4, width: 320 }));
  assert.equal((await patch({ webApps: [], webAppsRevision: 1 })).status, 200);
  assert.equal((await fetch(`${qr}?session=training`)).status, 404);
  assert.equal(data.pages[1].content, '유지');
});
