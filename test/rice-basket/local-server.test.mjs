import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { Readable } from 'node:stream';
import { generateKeyPair, exportPKCS8, jwtVerify } from 'jose';
import { createLocalRiceBasket } from '../../scripts/rice-basket-local.mjs';
import { createHandler } from '../../lib/rice-basket/server.mjs';

const serverScript = new URL('../../scripts/serve.mjs', import.meta.url);
function spoofedHost(url) {
  return new Promise((resolve, reject) => {
    request(url, { headers: { Host: 'evil.example', Authorization: 'Bearer rice-basket-local', 'x-forwarded-for': '127.0.0.1' } }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject).end();
  });
}
async function start(t, env = {}) {
  const root = await mkdtemp(join(tmpdir(), 'rice-basket-local-'));
  await mkdir(join(root, 'rice-basket'));
  await mkdir(join(root, 'js'));
  await mkdir(join(root, 'bungmo'));
  await writeFile(join(root, 'bungmo/index.html'), '<!doctype html><html><head></head><body>붕모</body></html>');
  await writeFile(join(root, 'admin.html'), await readFile(new URL('../../admin.html', import.meta.url)));
  await writeFile(join(root, 'js/admin.js'), await readFile(new URL('../../js/admin.js', import.meta.url)));
  await mkdir(join(root, '.data'));
  await writeFile(join(root, '.data/rice-basket.json'), JSON.stringify({ schemaVersion: 3, pages: [], sessions: [], surveys: [] }));
  await writeFile(join(root, 'rice-basket/operator.js'), await readFile(new URL('../../rice-basket/operator.js', import.meta.url)));
  await writeFile(join(root, 'rice-basket/index.html'), await readFile(new URL('../../rice-basket/index.html', import.meta.url)));
  const child = spawn(process.execPath, [serverScript.pathname], {
    cwd: root, env: { ...process.env, FIREBASE_BOOONG_CONTENT_SERVER: '', NODE_ENV: 'development', VERCEL: '', HOST: '127.0.0.1', PORT: '0', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    const closed = new Promise(resolve => child.once('close', resolve));
    child.kill();
    await closed;
    await rm(root, { recursive: true, force: true });
  });
  const base = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Local server startup timed out')), 10000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
    child.stdout.on('data', chunk => {
      output += chunk;
      const url = output.match(/http:\/\/(?:127\.0\.0\.1|0\.0\.0\.0):\d+/)?.[0];
      if (url) { clearTimeout(timer); resolve(url.replace('0.0.0.0','127.0.0.1')); }
    });
  });
  return { root, base };
}

test('studies는 기존 자료를 제공하고 이전 주소는 페이지·연수·설문 쿼리를 유지해 이동한다', async t => {
  const { base } = await start(t);
  const query = '?p=page-d5ccbf8787cd&s=training&survey=survey1&manage=1';
  for (const [oldPath, newPath] of [['/rice-basket', '/studies/'], ['/rice-basket/', '/studies/'], ['/rice-basket/operator.js', '/studies/operator.js']]) {
    const response = await fetch(base + oldPath + query, { redirect: 'manual' });
    assert.equal(response.status, 308);
    assert.equal(response.headers.get('location'), newPath + query);
  }
  const page = await fetch(base + '/studies/' + query);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /src="\/studies\/app.js"/);
  assert.match(await (await fetch(base + '/studies/operator.js')).text(), /import\('\.\/local-auth.js'\)/);
  assert.match(await (await fetch(base + '/studies/local-auth.js')).text(), /Bearer rice-basket-local/);
  assert.equal((await fetch(base + '/studies/.data/rice-basket.json')).status, 403);
  assert.equal((await fetch(base + '/studies-other/')).status, 404);
  const config = JSON.parse(await readFile(new URL('../../vercel.json', import.meta.url)));
  assert.ok(config.redirects.some(route => route.source === '/rice-basket/:path*' && route.destination === '/studies/:path*' && route.permanent));
  assert.ok(config.rewrites.some(route => route.source === '/studies/:path*' && route.destination === '/rice-basket/:path*'));
  assert.ok(config.redirects.some(route => route.source === '/rice-basket/' && route.destination === '/studies/' && route.permanent));
  assert.ok(config.rewrites.some(route => route.source === '/studies/' && route.destination === '/rice-basket/index.html'));
});

test('로컬에서 저장한 자료와 유형을 운영 핸들러가 즉시 읽고 연결 실패 시 대체 저장하지 않는다', async () => {
  let data = { schemaVersion: 3, pages: [{ id: 'page-d5ccbf8787cd', title: '웹앱', sections: [], webApps: [] }], sessions: [], surveys: [] };
  const storage = { load: async () => ({ data: structuredClone(data) }), save: async state => { data = state.data; } };
  const local = createLocalRiceBasket(storage), production = createHandler(storage);
  async function call(run, route, method = 'GET', body) {
    const req = Readable.from(body ? [JSON.stringify(body)] : []);
    Object.assign(req, { method, url: run === local ? `/api/rice-basket?route=${route}` : route, headers: { host: 'localhost', authorization: 'Bearer rice-basket-local' }, riceBasketAdmin: true });
    let status, result;
    await run(req, { writeHead: code => { status = code; }, end: value => { result = JSON.parse(value); } });
    return { status, body: result };
  }
  assert.equal((await call(local, '/api/pages', 'POST', { title: '공유 자료', content: '바로 반영' })).status, 201);
  const types = [{ id: 'type-1', label: '저장한 유형' }];
  assert.equal((await call(local, '/api/pages/page-d5ccbf8787cd', 'PATCH', { webAppTypes: types, webAppsRevision: 0 })).status, 200);
  assert.equal((await call(production, '/api/pages')).body.pages.length, 2);
  assert.deepEqual((await call(production, '/api/pages/page-d5ccbf8787cd')).body.webAppTypes, types);
  const session = await call(local, '/api/sessions', 'POST', { name: '공유 연수', pageIds: ['page-d5ccbf8787cd'] });
  assert.equal(session.status, 201);
  assert.equal((await call(production, `/api/sessions/${session.body.id}`)).body.name, '공유 연수');
  assert.equal((await call(local, '/api/pages/page-d5ccbf8787cd', 'PATCH', { webAppTypes: [], webAppsRevision: 0 })).status, 409);
  const before = structuredClone(data);
  storage.load = async () => { throw new Error('Connection unavailable'); };
  assert.equal((await call(local, '/api/pages', 'POST', { title: '저장 실패', content: '로컬로 대체하지 않음' })).status, 503);
  assert.deepEqual(data, before);
});

test('loopback server requires production storage, keeps guests public and rejects spoofed hosts', async t => {
  const { root, base } = await start(t);
  const headers = { Authorization: 'Bearer rice-basket-local', 'Content-Type': 'application/json' };
  const adminUrl = base + '/api/rice-basket?route=/api/admin';
  assert.equal((await fetch(adminUrl)).status, 401);
  assert.equal((await fetch(adminUrl, { headers })).status, 503);
  const created = await fetch(base + '/api/rice-basket?route=/api/pages', {
    method: 'POST', headers, body: JSON.stringify({ title: '로컬 자료', content: '로컬 내용' }),
  });
  assert.equal(created.status, 503);
  assert.deepEqual(JSON.parse(await readFile(join(root, '.data/rice-basket.json'), 'utf8')).pages, []);
  assert.equal((await fetch(base + '/api/rice-basket?route=/api/pages', { method: 'POST', headers: { ...headers, Origin: 'https://evil.example' }, body: '{}' })).status, 401);
  const operator = await (await fetch(base + '/studies/operator.js')).text();
  assert.match(operator, /import\('\.\/local-auth.js'\)/);
  assert.match(await (await fetch(base + '/studies/local-auth.js')).text(), /Bearer rice-basket-local/);
  assert.equal((await spoofedHost(adminUrl)).status, 401);
  assert.match((await spoofedHost(base + '/studies/operator.js')).body, /import\('\.\.\/js\/admin.js'\)/);
});

test('운영자 홈과 모든 관리 도구가 로컬 인증을 공유하며 외부 요청은 차단한다', async t => {
  const { base } = await start(t);
  const home = await fetch(base + '/admin.html');
  assert.match(await home.text(), /src="js\/admin.js"/);
  const moduleResponse = await fetch(base + '/js/admin.js');
  assert.equal(moduleResponse.headers.get('cache-control'), 'no-store');
  const module = await moduleResponse.text();
  assert.match(module, /\.\/local-admin-auth.js/);
  assert.match(module, /수업 준비실을 살피는 시간/);
  assert.doesNotMatch(module, /from "\.\/firebase-config.js"|www.gstatic.com/);
  assert.match(await (await fetch(base + '/js/local-admin-auth.js')).text(), /uid: 'booong-local'/);
  const access = await fetch(base + '/api/admin');
  assert.equal(access.status, 200);
  assert.deepEqual(await access.json(), { email: 'noamchomsky1571@gmail.com', uid: null, local: true });
  assert.equal((await fetch(base + '/api/admin', { method: 'POST' })).status, 405);
  for (const [path, method, status] of [
    ['/api/textbooks?catalog=1', 'GET', 200], ['/api/notices?admin=1', 'GET', 503],
    ['/api/research-erp?month=2026-11', 'GET', 503], ['/api/watcha-library', 'GET', 400],
    ['/api/bungmo-session', 'POST', 503],
  ]) assert.equal((await fetch(base + path, { method })).status, status, path + ' skips Google authentication');
  assert.match(await (await fetch(base + '/bungmo/')).text(), /window\.__BOOONG_LOCAL_ADMIN__=true/);
  assert.equal((await spoofedHost(base + '/api/admin')).status, 401);
  assert.doesNotMatch((await spoofedHost(base + '/admin.html')).body, /local-admin-home/);
  assert.equal((await spoofedHost(base + '/js/local-admin-auth.js')).status, 404);
  assert.match((await spoofedHost(base + '/js/admin.js')).body, /www.gstatic.com/);
  assert.doesNotMatch((await spoofedHost(base + '/bungmo/')).body, /__BOOONG_LOCAL_ADMIN__/);
  assert.equal((await fetch(base + '/api/admin', { headers: { Origin: 'https://evil.example' } })).status, 401);
});

test('붕모 로컬 세션은 요청한 UID 대신 설정된 기존 운영자 UID만 사용한다', async t => {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  const account = 'booong-bungmo-server@yadoran-2025.iam.gserviceaccount.com';
  const { base } = await start(t, {
    BOOONG_LOCAL_ADMIN_UID: 'existing-operator',
    FIREBASE_BUNGMO_SERVER: Buffer.from(JSON.stringify({ type: 'service_account', project_id: 'yadoran-2025', client_email: account, private_key: await exportPKCS8(privateKey) })).toString('base64'),
  });
  const response = await fetch(base + '/api/bungmo-session?uid=someone-else', { method: 'POST' });
  assert.equal(response.status, 200);
  const { token } = await response.json();
  const { payload } = await jwtVerify(token, publicKey, { issuer: account });
  assert.equal(payload.uid, 'existing-operator');
  assert.equal(payload.claims.bungmoEmail, 'noamchomsky1571@gmail.com');
  assert.equal(payload.claims.bungmoOperator, true);
  assert.ok(payload.claims.bungmoUntil <= Math.floor(Date.now() / 1000) + 120);
  assert.equal((await fetch(base + '/api/bungmo-session', { method: 'POST', headers: { Origin: 'https://evil.example' } })).status, 401);
});

for (const env of [{ NODE_ENV: 'production' }, { VERCEL: '1' }, { HOST: '0.0.0.0' }]) {
  test(`local authentication is disabled with ${JSON.stringify(env)}`, async t => {
    const { base } = await start(t, env);
    assert.equal((await fetch(base + '/api/rice-basket?route=/api/admin', { headers: { Authorization: 'Bearer rice-basket-local' } })).status, 401);
    assert.match(await (await fetch(base + '/studies/operator.js')).text(), /import\('\.\.\/js\/admin.js'\)/);
    assert.equal((await fetch(base + '/studies/local-auth.js')).status, 404);
    assert.equal((await fetch(base + '/api/admin')).status, 401);
    assert.doesNotMatch(await (await fetch(base + '/admin.html')).text(), /local-admin-home/);
    assert.equal((await fetch(base + '/js/local-admin-home.js')).status, 404);
    assert.equal((await fetch(base + '/js/local-admin-auth.js')).status, 404);
    assert.match(await (await fetch(base + '/js/admin.js')).text(), /www.gstatic.com/);
    assert.doesNotMatch(await (await fetch(base + '/bungmo/')).text(), /__BOOONG_LOCAL_ADMIN__/);
    assert.equal((await fetch(base + '/api/textbooks?catalog=1')).status, 401);
  });
}
