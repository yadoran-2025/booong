import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyB_wsXQ_THiDLIvlaQAKEJCzIlz5M5dbDY",
  authDomain: "yadoran-2025.firebaseapp.com",
  databaseURL: "https://yadoran-2025-default-rtdb.firebaseio.com",
  projectId: "yadoran-2025",
  storageBucket: "yadoran-2025.firebasestorage.app",
  messagingSenderId: "266288546185",
  appId: "1:266288546185:web:727060b22ce9643d0c2158",
  measurementId: "G-7MX74KVJCE",
};

export const firebaseApp = initializeApp(firebaseConfig);
export const db = getDatabase(firebaseApp);
export * from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
