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

export function createLocalRiceBasket(storage) {
  const run = createHandler(storage);
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
