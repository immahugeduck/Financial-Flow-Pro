import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBnhF1RlPl8lMKsvtS7M7SEGJwvRDzNPWA",
  authDomain: "financial-flow-3cbb2.firebaseapp.com",
  projectId: "financial-flow-3cbb2",
  storageBucket: "financial-flow-3cbb2.firebasestorage.app",
  messagingSenderId: "446980586056",
  appId: "1:446980586056:web:3b2ffe4c25ecd5467f367d",
  measurementId: "G-9SQ1LNC28T",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

export const signInWithGooglePopup = () => signInWithPopup(auth, provider);
export const signInWithGoogleRedirect = () => signInWithRedirect(auth, provider);
export const resolveGoogleRedirectResult = () => getRedirectResult(auth);
