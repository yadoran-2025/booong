const authorizedRequests = new WeakSet();

export function isLoopbackRequest(req) {
  return process.env.NODE_ENV === 'development' && !process.env.VERCEL
    && /^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?$/.test(req.headers.host || '')
    && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket?.remoteAddress)
    && (!req.headers.origin || req.headers.origin === `http://${req.headers.host}`);
}

export async function withLocalAdmin(req, run) {
  if (!isLoopbackRequest(req)) return run();
  authorizedRequests.add(req);
  try { return await run(); }
  finally { authorizedRequests.delete(req); }
}

export function localAdminAccess(req) {
  if (!authorizedRequests.has(req) || !isLoopbackRequest(req)) return null;
  return { status: 200, body: { email: 'noamchomsky1571@gmail.com', uid: process.env.BOOONG_LOCAL_ADMIN_UID || null, local: true } };
}
