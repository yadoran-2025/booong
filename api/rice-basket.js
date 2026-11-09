import { adminAccess } from './admin.js';
import { sendJson } from '../lib/dorms-auth.js';
import { handler as workshop, isPublicRequest } from '../lib/rice-basket/server.mjs';
import { createThumbnailRequestGuard, thumbnailClientIp } from '../lib/thumbnail-reads.js';

export function createRiceBasketHandler(run = workshop, limit = createThumbnailRequestGuard(Date.now, 6000)) {
  return async (req, res) => {
    const retryAfter = limit(thumbnailClientIp(req));
    if (retryAfter) {
      res.setHeader('Retry-After', String(retryAfter));
      return sendJson(res, 429, { error: '요청이 너무 많습니다. 입력은 유지한 채 잠시 후 다시 시도해 주세요.' });
    }
    const url = new URL(req.url, 'https://booong.vercel.app');
    const route = url.searchParams.get('route');
    if (url.searchParams.getAll('route').length !== 1 || !route || !/^\/api\/[a-zA-Z0-9/_-]+$/.test(route) || ['/api/login', '/api/logout'].includes(route)) return sendJson(res, 404, { reason: 'not_found' });
    url.searchParams.delete('route');
    req.url = route + url.search;
    req.riceBasketAdmin = false;
    if (req.headers.authorization || !isPublicRequest(req)) {
      const access = await adminAccess(req);
      if (access.status !== 200) return sendJson(res, access.status, access.body);
      req.riceBasketAdmin = true;
    }
    return run(req, res);
  };
}

const integrated = createRiceBasketHandler();
export default async function handler(req, res) { return integrated(req, res); }
