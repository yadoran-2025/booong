import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { BlobPreconditionFailedError } from '@vercel/blob';
import { generateKeyPair, exportPKCS8, jwtVerify } from 'jose';
import { createLocalStore } from '../../scripts/rice-basket-local.mjs';

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
  const child = spawn(process.execPath, [serverScript.pathname], {
    cwd: root, env: { ...process.env, NODE_ENV: 'development', VERCEL: '', HOST: '127.0.0.1', PORT: '0', ...env },
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

test('local store persists changes and rejects stale writes or invalid files', async t => {
  const root = await mkdtemp(join(tmpdir(), 'rice-basket-store-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, '.data/store.json'), store = createLocalStore(path);
  await assert.rejects(store.load(), /빈 저장소로 시작하지 않습니다/);
  await mkdir(join(root, '.data'));
  await writeFile(path, JSON.stringify({ schemaVersion: 3, pages: [], sessions: [], surveys: [] }));
  const first = await store.load(), stale = await store.load();
  first.data.pages.push({ id: 'local-page' });
  await store.save(first);
  assert.equal((await createLocalStore(path).load()).data.pages[0].id, 'local-page');
  await assert.rejects(store.save(stale), BlobPreconditionFailedError);
  await writeFile(path, '{broken');
  await assert.rejects(store.load(), SyntaxError);
  assert.equal(await readFile(path, 'utf8'), '{broken');
});

test('loopback server supports local editing, keeps guests public and rejects spoofed hosts', async t => {
  const { root, base } = await start(t);
  const headers = { Authorization: 'Bearer rice-basket-local', 'Content-Type': 'application/json' };
  const adminUrl = base + '/api/rice-basket?route=/api/admin';
  assert.equal((await fetch(adminUrl)).status, 401);
  assert.equal((await fetch(adminUrl, { headers })).status, 200);
  const created = await fetch(base + '/api/rice-basket?route=/api/pages', {
    method: 'POST', headers, body: JSON.stringify({ title: '로컬 자료', content: '로컬 내용' }),
  });
  assert.equal(created.status, 201);
  assert.equal(JSON.parse(await readFile(join(root, '.data/rice-basket.json'), 'utf8')).pages[0].title, '로컬 자료');
  assert.equal((await fetch(base + '/api/rice-basket?route=/api/pages', { method: 'POST', headers: { ...headers, Origin: 'https://evil.example' }, body: '{}' })).status, 401);
  const operator = await (await fetch(base + '/rice-basket/operator.js')).text();
  assert.match(operator, /from '\.\/local-auth.js'/);
  assert.match(await (await fetch(base + '/rice-basket/local-auth.js')).text(), /Bearer rice-basket-local/);
  assert.equal((await spoofedHost(adminUrl)).status, 401);
  assert.match((await spoofedHost(base + '/rice-basket/operator.js')).body, /from '\.\.\/js\/admin.js'/);
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
    assert.match(await (await fetch(base + '/rice-basket/operator.js')).text(), /from '\.\.\/js\/admin.js'/);
    assert.equal((await fetch(base + '/rice-basket/local-auth.js')).status, 404);
    assert.equal((await fetch(base + '/api/admin')).status, 401);
    assert.doesNotMatch(await (await fetch(base + '/admin.html')).text(), /local-admin-home/);
    assert.equal((await fetch(base + '/js/local-admin-home.js')).status, 404);
    assert.equal((await fetch(base + '/js/local-admin-auth.js')).status, 404);
    assert.match(await (await fetch(base + '/js/admin.js')).text(), /www.gstatic.com/);
    assert.doesNotMatch(await (await fetch(base + '/bungmo/')).text(), /__BOOONG_LOCAL_ADMIN__/);
    assert.equal((await fetch(base + '/api/textbooks?catalog=1')).status, 401);
  });
}
