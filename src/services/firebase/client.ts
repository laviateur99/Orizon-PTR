import { getApps, initializeApp } from "firebase/app";
import { getFirestore, initializeFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};
const appEnvironment = process.env.NEXT_PUBLIC_APP_ENV;
const projectId = firebaseConfig.projectId || "";
if (appEnvironment === "test" && !/(test|staging|sandbox|demo)/i.test(projectId)) {
  throw new Error("Sécurité: la version de test refuse un projet Firebase qui ne porte pas un nom de test.");
}
const existingApp = getApps()[0];
export const app = existingApp ?? initializeApp(firebaseConfig);
export const db = existingApp
    ? getFirestore(app)
    : initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
    });
export const auth = getAuth(app);
