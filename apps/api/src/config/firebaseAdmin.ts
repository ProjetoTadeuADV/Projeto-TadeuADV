import { initializeApp, cert, getApps, App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { env } from "./env.js";

let cachedApp: App | null = null;

function getPrivateKey(): string {
  return env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");
}

function initializeFirebaseApp(): App {
  if (cachedApp) {
    return cachedApp;
  }

  if (getApps().length > 0) {
    cachedApp = getApps()[0];
    return cachedApp;
  }

  cachedApp = initializeApp({
    credential: cert({
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: getPrivateKey()
    }),
    ...(env.FIREBASE_STORAGE_BUCKET.trim()
      ? {
          storageBucket: env.FIREBASE_STORAGE_BUCKET.trim()
        }
      : {})
  });

  return cachedApp;
}

export function getFirebaseAuth() {
  return getAuth(initializeFirebaseApp());
}

export function getFirebaseFirestore() {
  return getFirestore(initializeFirebaseApp());
}

export function getFirebaseStorage() {
  return getStorage(initializeFirebaseApp());
}
