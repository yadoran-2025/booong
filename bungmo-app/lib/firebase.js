import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { isLocalPreview } from "./bungmo/local-preview.js";

const firebaseConfig = {
  projectId: "yadoran-2025",
  appId: "1:266288546185:web:727060b22ce9643d0c2158",
  databaseURL: "https://yadoran-2025-default-rtdb.firebaseio.com",
  storageBucket: "yadoran-2025.firebasestorage.app",
  apiKey: "AIzaSyB_wsXQ_THiDLIvlaQAKEJCzIlz5M5dbDY",
  authDomain: "yadoran-2025.firebaseapp.com",
  messagingSenderId: "266288546185"
};

export const firebaseApp = typeof window === "undefined" || isLocalPreview() ? null : (getApps().length ? getApp() : initializeApp(firebaseConfig));

export const auth = firebaseApp && getAuth(firebaseApp);
const dataApp = firebaseApp && (getApps().find(app => app.name === "booong-bungmo-data") || initializeApp(firebaseConfig, "booong-bungmo-data"));
export const dataAuth = dataApp && getAuth(dataApp);
export const db = dataApp && getFirestore(dataApp);
