// Only the loopback development server serves this module to management tools.
export const localAdminAuthSource = `
const auth = {
  currentUser: { uid: 'booong-local', email: '로컬', getIdToken: async () => 'booong-local' },
  authStateReady: async () => {},
};
export const getAuth = () => auth;
export const onAuthStateChanged = (_, listener) => { queueMicrotask(() => listener(auth.currentUser)); return () => {}; };
export class GoogleAuthProvider {}
export const signInWithPopup = async () => { throw new Error('로컬에서는 로그인이 필요하지 않습니다.'); };
`;

export function localAdminHomeSource(source) {
  return source.replace(/^import \{ firebaseApp \} from "\.\/firebase-config\.js";$/m, 'const firebaseApp = null;')
    .replace('"https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"', '"./local-admin-auth.js"');
}
