import { inMemoryPersistence, setPersistence, signInWithCustomToken, signOut } from "firebase/auth";
import { auth, dataAuth } from "../firebase.js";

export async function openOperatorSession(user) {
  const response = await fetch("/api/bungmo-session", {
    method: "POST", headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: "no-store", signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) {
    const error = new Error(response.status === 403 ? "운영자로 등록된 계정만 붕모를 이용할 수 있어요."
      : response.status === 401 ? "Google 계정으로 다시 로그인해 주세요."
      : "운영자 권한을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.");
    error.denied = response.status === 401 || response.status === 403;
    throw error;
  }
  const { token, email } = await response.json();
  if (typeof token !== "string" || !token || typeof email !== "string" || !email) throw new Error("운영자 계정 정보를 확인하지 못했어요.");
  if (auth.currentUser?.uid !== user.uid) throw new Error("로그인 계정이 바뀌었어요.");
  await setPersistence(dataAuth, inMemoryPersistence);
  if (auth.currentUser?.uid !== user.uid) throw new Error("로그인 계정이 바뀌었어요.");
  await signInWithCustomToken(dataAuth, token);
  if (auth.currentUser?.uid !== user.uid) {
    if (dataAuth.currentUser?.uid === user.uid) await signOut(dataAuth);
    throw new Error("로그인 계정이 바뀌었어요.");
  }
  return email;
}
