import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import QRCode from 'qrcode';
import { readFileSync } from 'node:fs';
import { createHandler } from '../../lib/rice-basket/server.mjs';
import { WEB_APPS_PAGE_ID, webAppDefinitions, webAppThumbnailUrl, DEFAULT_WEB_APP_TYPES, validateWebAppTypes } from '../../rice-basket/web-app-config.js';

const entry = { title: ' 같이 실습 ', teacherUrl: 'https://example.org/teacher?room=class1#dashboard', studentUrl: 'https://example.org/student?room=class1&channel=social#join' };
const thumbnailImage = 'data:image/jpeg;base64,' + readFileSync(new URL('../../assets/lesson-thumbnails/apps/group-2.jpg', import.meta.url)).toString('base64');

test('유형 문구는 공백을 정리하고 빈 문구·중복·긴 문구를 거부한다', () => {
  assert.deepEqual(validateWebAppTypes(DEFAULT_WEB_APP_TYPES).map(type => type.label), [...DEFAULT_WEB_APP_TYPES]);
  assert.deepEqual(validateWebAppTypes([' 유형 이름 ']), [{ id: 'type-1', label: '유형 이름' }]);
  assert.deepEqual(validateWebAppTypes([]), []);
  for (const value of [null, {}, [''], [' a ', 'a'], ['a\nb'], ['가'.repeat(301)], Array(21).fill('유형')]) assert.throws(() => validateWebAppTypes(value));
});

test('자동 썸네일은 공개 시작 주소만 전달하고 교사 방 경로·쿼리·해시를 제외한다', () => {
  const thumbnail = webAppThumbnailUrl(entry.teacherUrl);
  assert.equal(thumbnail, 'https://image.thum.io/get/width/1200/crop/750/noanimate/https://example.org/');
  for (const privatePart of ['teacher', 'room=', 'class1', '#dashboard']) assert.equal(thumbnail.includes(privatePart), false);
  for (const invalid of ['', 'javascript:alert(1)', 'http://example.org', 'https://user:password@example.org/private', 'https://localhost', 'https://host.local', 'https://host.localhost', 'https://127.0.0.1', 'https://192.168.1.3', 'https://[::1]']) assert.equal(webAppThumbnailUrl(invalid), '');
});

test('웹앱 이름과 HTTPS URL을 검증하고 방·채널·해시를 보존한다', () => {
  assert.deepEqual(webAppDefinitions([entry]), [{ ...entry, title: '같이 실습' }]);
  assert.deepEqual(webAppDefinitions([]), []);
  assert.deepEqual(webAppDefinitions([{ ...entry, thumbnailUrl: '' }]), webAppDefinitions([entry]));
  const image = 'https://example.org/dashboard.jpg';
  assert.equal(webAppDefinitions([{ ...entry, thumbnailUrl: image }])[0].thumbnailUrl, image);
  for (const thumbnailUrl of ['javascript:alert(1)', 'data:image/png;base64,123', 'http://example.org/image.png', 'https://user:secret@example.org/image.png', {}]) assert.throws(() => webAppDefinitions([{ ...entry, thumbnailUrl }]));
  for (const bad of [null, {}, Array(21).fill(entry), [{ ...entry, title: '' }], [{ ...entry, title: '가'.repeat(121) }]]) assert.throws(() => webAppDefinitions(bad));
  for (const key of ['teacherUrl', 'studentUrl']) for (const url of ['javascript:alert(1)', 'data:text/html,test', 'http://example.org', 'https://user:secret@example.org', null, 'https://example.org/' + 'a'.repeat(2000)]) assert.throws(() => webAppDefinitions([{ ...entry, [key]: url }]));
  assert.throws(() => webAppDefinitions([{ ...entry, teacherUrl: '' }]));
  for (const studentUrl of [undefined, '', '  ']) {
    assert.deepEqual(webAppDefinitions([{ ...entry, studentUrl }]), [{ title: '같이 실습', teacherUrl: entry.teacherUrl }]);
  }
});

test('연수 참가자에게 같은 웹앱·캡처와 학생 QR을 제공하고 설정 변경은 차단한다', async t => {
  let data = { schemaVersion: 3, pages: [{ id: WEB_APPS_PAGE_ID, title: '웹앱 공유', content: '소개', sections: [] }, { id: 'other', title: '다른 내용', content: '유지', sections: [] }], sessions: [{ id: 'training', pageIds: [WEB_APPS_PAGE_ID], participants: [] }, { id: 'unrelated', pageIds: ['other'], participants: [] }] };
  const handler = createHandler({ load: async () => ({ data: structuredClone(data), etag: '1' }), save: async state => { data = structuredClone(state.data); } });
  const server = createServer((req, res) => { req.riceBasketAdmin = req.headers.authorization === 'Bearer owner';handler(req, res); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`, route = `/api/pages/${WEB_APPS_PAGE_ID}`;
  const patch = (body, owner = true, target = route) => fetch(base + target, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(owner ? { Authorization: 'Bearer owner' } : {}) }, body: JSON.stringify(body) });
  assert.equal((await patch({ webApps: [entry], webAppsRevision: 0 }, false)).status, 401);
  assert.equal((await patch({ webApps: [entry], webAppsRevision: 0 }, true, '/api/pages/other')).status, 400);
  assert.equal((await patch({ webApps: [{ ...entry, studentUrl: 'javascript:bad' }], webAppsRevision: 0 })).status, 400);
  assert.equal((await patch({ webApps: [{ ...entry, thumbnailImage: 'data:image/svg+xml;base64,PHN2Zy8+' }], webAppsRevision: 0 })).status, 400);
  const withImage = { ...entry, thumbnailUrl: 'https://example.org/dashboard.jpg', thumbnailImage };
  const saved = await patch({ webApps: [withImage], webAppsRevision: 0 });assert.equal(saved.status, 200);
  assert.equal((await saved.json()).webAppsRevision, 1);
  assert.equal((await patch({ webApps: [], webAppsRevision: 0 })).status, 409);
  const page = await (await fetch(`${base}${route}?session=training`)).json();
  const studentApps = webAppDefinitions([withImage]);
  assert.deepEqual(page.webApps, studentApps);assert.equal(page.content, '소개');
  const session = await (await fetch(`${base}/api/sessions/training`)).json();
  assert.deepEqual(session.pages[0].webApps, studentApps);
  assert.equal(JSON.stringify(session).includes(entry.teacherUrl), true);
  assert.equal((await fetch(`${base}${route}?session=unrelated`)).status, 404);
  const ownerPage = await (await fetch(base + route, { headers: { Authorization: 'Bearer owner' } })).json();
  assert.deepEqual(ownerPage.webApps, webAppDefinitions([withImage]));
  const qr = `${base}${route}/web-apps/0/qr`;
  assert.equal((await fetch(qr)).status, 401);
  assert.equal((await fetch(`${qr}?session=unrelated`)).status, 404);
  assert.equal((await fetch(`${base}${route}/web-apps/8/qr?session=training`)).status, 404);
  const response = await fetch(`${qr}?session=training`);assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/svg+xml');
  assert.equal(await response.text(), await QRCode.toString(entry.studentUrl, { type: 'svg', errorCorrectionLevel: 'M', margin: 4, width: 320 }));
  assert.equal((await patch({ webApps: [{ ...entry, studentUrl: '' }], webAppsRevision: 1 })).status, 200);
  const withoutStudentUrl = await (await fetch(`${base}${route}?session=training`)).json();
  assert.deepEqual(withoutStudentUrl.webApps, [{ title: '같이 실습', teacherUrl: entry.teacherUrl }]);
  assert.equal((await fetch(`${qr}?session=training`)).status, 404);
  const captures = Array.from({ length: 20 }, () => withImage);
  assert.ok(JSON.stringify(captures).length > 200_000);
  assert.equal((await patch({ webApps: captures, webAppsRevision: 2 })).status, 200);
  assert.equal((await (await fetch(base + route, { headers: { Authorization: 'Bearer owner' } })).json()).webApps[19].thumbnailImage, thumbnailImage);
  assert.equal((await patch({ webApps: [], webAppsRevision: 3, unexpected: 'x'.repeat(4_000_000) })).status, 413);
  assert.equal((await patch({ webApps: [], webAppsRevision: 3 })).status, 200);
  assert.equal((await fetch(`${qr}?session=training`)).status, 404);
  assert.equal(data.pages[1].content, '유지');
  assert.equal((await patch({ webApps: [{ lessonId: 'group-2' }], webAppsRevision: 4 })).status, 200);
  assert.deepEqual(data.pages[0].webApps, [{ lessonId: 'group-2' }]);
  const linked = { lessonId: 'group-2', teacherUrl: entry.teacherUrl, studentUrl: entry.studentUrl };
  assert.equal((await patch({ webApps: [linked], webAppsRevision: 5 })).status, 200);
  const linkedPublic = await (await fetch(`${base}${route}?session=training`)).json();
  assert.deepEqual(linkedPublic.webApps, [linked]);
  assert.equal((await fetch(`${qr}?session=training`)).status, 200);
  const typesBody = { webAppTypes: DEFAULT_WEB_APP_TYPES, webAppsRevision: 6 };
  assert.equal((await patch(typesBody, false)).status, 401);
  assert.equal((await patch(typesBody, true, '/api/pages/other')).status, 400);
  assert.equal((await patch({ ...typesBody, webAppTypes: [''] })).status, 400);
  assert.equal((await patch({ ...typesBody, webAppsRevision: 5 })).status, 409);
  assert.equal((await patch(typesBody)).status, 200);
  assert.deepEqual(data.pages[0].webApps, [linked]);
  assert.deepEqual((await (await fetch(`${base}${route}?session=training`)).json()).webAppTypes.map(type => type.label), [...DEFAULT_WEB_APP_TYPES]);
  assert.equal((await patch({ webApps: [], webAppsRevision: 6 })).status, 409);
  assert.equal((await patch({ webAppTypes: [], webAppsRevision: 7 })).status, 200);
  assert.deepEqual(data.pages[0].webAppTypes, []);
  const types = validateWebAppTypes(DEFAULT_WEB_APP_TYPES);
  assert.equal((await patch({ webAppTypes: types, webAppsRevision: 8 })).status, 200);
  assert.equal((await patch({ webApps: [{ ...linked, typeId: 'type-999' }], webAppsRevision: 9 })).status, 400);
  assert.equal((await patch({ webApps: [{ ...linked, typeId: 'type-3' }], webAppsRevision: 9 })).status, 200);
  assert.equal((await (await fetch(`${base}${route}?session=training`)).json()).webApps[0].typeId, 'type-3');
  types[2].label = '문구를 수정한 데이터 기반 전광판';
  assert.equal((await patch({ webAppTypes: types, webAppsRevision: 10 })).status, 200);
  assert.equal(data.pages[0].webApps[0].typeId, 'type-3');
  assert.equal((await patch({ webAppTypes: types.slice(1), webAppsRevision: 11 })).status, 200);
  assert.equal(data.pages[0].webAppTypes[1].id, 'type-3');assert.equal(data.pages[0].webApps[0].typeId, 'type-3');
  assert.equal((await patch({ webAppTypes: types.filter(type => type.id !== 'type-3'), webAppsRevision: 12 })).status, 200);
  assert.deepEqual(data.pages[0].webApps, [linked]);
});
