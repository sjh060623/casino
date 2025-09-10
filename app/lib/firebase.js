// Import the functions you need from the SDKs you need

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
// lib/firebase.js
import { initializeApp, getApp, getApps } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  updateProfile,
} from "firebase/auth";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBBOf987WibhkSz_qHSqNe9Is-JLhKaYfs",
  authDomain: "casino-e07ba.firebaseapp.com",
  projectId: "casino-e07ba",
  storageBucket: "casino-e07ba.firebasestorage.app",
  messagingSenderId: "1019127821313",
  appId: "1:1019127821313:web:e99b4e78b379263b783c00",
  measurementId: "G-9EC2DSP7FH",
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

// 익명 로그인 헬퍼
export async function ensureAnonSignIn() {
  if (auth.currentUser) return auth.currentUser;
  const res = await signInAnonymously(auth);
  return res.user;
}

// 닉네임을 Firebase Auth(표시명)에도 반영(선택)
export async function setAuthDisplayName(nickname) {
  if (!auth.currentUser) return;
  await updateProfile(auth.currentUser, { displayName: nickname });
}
