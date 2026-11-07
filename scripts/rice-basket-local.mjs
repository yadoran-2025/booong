import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { BlobPreconditionFailedError } from '@vercel/blob';
import { createHandler } from '../lib/rice-basket/server.mjs';

export const localAuthSource = `
export const adminAccountId = () => 'rice-basket-local';
export const requireAdmin = async () => true;
export const onAdminAccountChange = listener => queueMicrotask(() => listener(adminAccountId()));
export function adminFetch(url, options = {}) {
  const headers = new Headers(options.headers);
  headers.set('Authorization', 'Bearer rice-basket-local');
  return fetch(url, { ...options, headers, credentials: 'omit', cache: 'no-store' });
}
`;

export function createLocalStore(path) {
  function read() {
    let body;
    try { body = readFileSync(path, 'utf8'); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      throw new Error('기존 쌀바구니 자료를 .data/rice-basket.json에 복사해 주세요. 빈 저장소로 시작하지 않습니다.');
    }
    const data = JSON.parse(body);
    if (data.schemaVersion !== 3 || !Array.isArray(data.pages) || !Array.isArray(data.sessions)) throw new Error('로컬 쌀바구니 저장소 형식이 올바르지 않습니다.');
    return { data, etag: createHash('sha256').update(body).digest('hex') };
  }
  return {
    load: async () => read(),
    async save(state) {
      if (state.etag !== read().etag) throw new BlobPreconditionFailedError();
      mkdirSync(dirname(path), { recursive: true });
      // Synchronous compare/write keeps local requests from overwriting concurrent edits.
      writeFileSync(path + '.tmp', JSON.stringify(state.data), { mode: 0o600 });
      renameSync(path + '.tmp', path);
      state.etag = read().etag;
    },
  };
}

export function createLocalRiceBasket(path) {
  const run = createHandler(createLocalStore(path));
  return (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const route = url.searchParams.get('route');
    if (!route || !/^\/api\/[a-zA-Z0-9/_-]+$/.test(route) || ['/api/login', '/api/logout'].includes(route)) {
      res.writeHead(404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ reason: 'not_found' }));
    }
    url.searchParams.delete('route');
    req.url = route + url.search;
    req.riceBasketAdmin = req.headers.authorization === 'Bearer rice-basket-local';
    return run(req, res);
  };
}
