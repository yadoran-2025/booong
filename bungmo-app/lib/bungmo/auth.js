import { signOut } from "firebase/auth";
import { auth, dataAuth } from "../firebase.js";
import { isLocalPreview } from "./local-preview.js";

export function signInWithGoogle() {
  if (isLocalPreview()) return Promise.resolve();
  window.location.assign(`/admin.html?${new URLSearchParams({ next: window.location.pathname + window.location.search + window.location.hash })}`);
}

export function signOutOfBungmo() {
  if (isLocalPreview()) return Promise.resolve();
  return Promise.all([signOut(dataAuth), signOut(auth)]);
}
