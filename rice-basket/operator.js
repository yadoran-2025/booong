let admin;
async function loadAdmin() { return admin ||= await import('../js/admin.js'); }
export const adminAccountId = () => admin?.adminAccountId() || null;
export async function requireAdmin(...args) { return (await loadAdmin()).requireAdmin(...args); }
export async function onAdminAccountChange(listener) { return (await loadAdmin()).onAdminAccountChange(listener); }

export function operatorUrl(path) {
  const target = new URL(path, location.origin);
  if (target.origin !== location.origin || !target.pathname.startsWith('/api/')) throw new Error('잘못된 쌀바구니 API 주소입니다.');
  target.searchParams.set('route', target.pathname);
  return '/api/rice-basket?' + target.searchParams;
}
export function publicFetch(path, options = {}) {
  return fetch(operatorUrl(path), { ...options, credentials: 'omit', cache: 'no-store' });
}
export async function operatorFetch(path, options) {
  const url = operatorUrl(path);
  const { adminFetch } = await loadAdmin();
  const account = adminAccountId();
  const response = await adminFetch(url, options);
  if (account !== adminAccountId()) throw new Error('Google 계정이 변경되었습니다. 다시 열어 주세요.');
  return response;
}
