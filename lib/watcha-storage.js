import { SignJWT, importPKCS8 } from 'jose';
import { WATCHA_FIREBASE } from '../js/watcha-firebase-config.js';

const account = 'watcha-cache@yadoran-2025.iam.gserviceaccount.com';
let session, signingIn;
let catalogue, catalogueLoading, catalogueVersion = 0;
const catalogueAge = 60 * 60 * 1000;

export function watchaStorageConfigured() { return Boolean(process.env.FIREBASE_WATCHA_SERVER); }

async function idToken() {
  if (session?.expires > Date.now()) return session.token;
  signingIn ||= (async () => {
    const credentials = JSON.parse(Buffer.from(process.env.FIREBASE_WATCHA_SERVER || '', 'base64').toString('utf8'));
    if (credentials.type !== 'service_account' || credentials.project_id !== WATCHA_FIREBASE.projectId || credentials.client_email !== account) throw new Error('Wrong watcha server credentials');
    const custom = await new SignJWT({uid:'watcha-cache-server', claims:{watchaCache:true}})
      .setProtectedHeader({alg:'RS256'}).setIssuer(account).setSubject(account)
      .setAudience('https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit')
      .setIssuedAt().setExpirationTime('1h').sign(await importPKCS8(credentials.private_key, 'RS256'));
    const response = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=' + WATCHA_FIREBASE.apiKey, {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({token:custom,returnSecureToken:true}),
      signal:AbortSignal.timeout(10000), redirect:'error', cache:'no-store',
    });
    const body = await response.json();
    if (!response.ok || typeof body.idToken !== 'string' || !(Number(body.expiresIn) > 60)) throw new Error('Watcha server authentication unavailable');
    session = {token:body.idToken,expires:Date.now() + (Number(body.expiresIn) - 60) * 1000};
    return session.token;
  })();
  try { return await signingIn; }
  finally { signingIn = null; }
}

export async function watchaDatabase(path = '', method = 'GET', data, onlyIfMissing = false) {
  if (!/^(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)?$/.test(path) || !['GET','PUT','PATCH'].includes(method)) throw new Error('Invalid watcha database request');
  if (path === 'books' && method === 'GET') {
    // ponytail: reuse a catalogue within one server instance; cold instances download it once.
    if (catalogue?.expires > Date.now()) return catalogue.value;
    if (catalogueLoading) return catalogueLoading;
    const version = catalogueVersion;
    const request = databaseRequest(path,method,data,onlyIfMissing).then(value => {
      if (version === catalogueVersion) catalogue = {value,expires:Date.now() + catalogueAge};
      return value;
    });
    catalogueLoading = request;
    try { return await request; }
    finally { if (catalogueLoading === request) catalogueLoading = null; }
  }
  const result = await databaseRequest(path,method,data,onlyIfMissing);
  if (method !== 'GET' && result !== false && (path === 'books' || path.startsWith('books/') || path === '' && Object.keys(data || {}).some(key => key === 'books' || key.startsWith('books/')))) {
    catalogueVersion++;
    catalogue = catalogueLoading = null;
  }
  return result;
}

async function databaseRequest(path, method, data, onlyIfMissing) {
  // Firebase ID tokens obey the dedicated DB's rules; no project-wide admin role.
  const url = new URL(`${WATCHA_FIREBASE.databaseURL}/watcha${path ? '/' + path : ''}.json`);
  url.searchParams.set('auth', await idToken());
  if (method !== 'GET') url.searchParams.set('print','silent');
  const response = await fetch(url, {
    method, headers:{'Content-Type':'application/json',...(onlyIfMissing ? {'if-match':'null_etag'} : {})}, ...(data === undefined ? {} : {body:JSON.stringify(data)}),
    signal:AbortSignal.timeout(15000), redirect:'error', cache:'no-store',
  });
  if (onlyIfMissing && response.status === 412) return false;
  if (!response.ok) { if (response.status === 401) session = null; throw new Error('Watcha database unavailable'); }
  return response.status === 204 ? true : response.json();
}

// JSON strings preserve empty arrays and null fields that RTDB otherwise removes.
export const readWatchaRecord = async path => {
  const value = await watchaDatabase(path);
  return value === null ? null : JSON.parse(value);
};
export const writeWatchaRecord = (path, value, onlyIfMissing = false) => watchaDatabase(path, 'PUT', JSON.stringify(value),onlyIfMissing);
