import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { auth } from "../firebase.js";
import { isLocalPreview } from "./local-preview.js";

export function signInWithGoogle() {
  if (isLocalPreview()) return Promise.resolve();
  return signInWithPopup(auth, new GoogleAuthProvider());
}

export function signOutOfBungmo() {
  if (isLocalPreview()) return Promise.resolve();
  return signOut(auth);
}
