import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

let app: any = null;
let dbInstance: any = null;
let authInstance: any = null;

const initializeFirebase = () => {
  if (!firebaseConfig.apiKey) {
    throw new Error('Firebase API key not configured');
  }
  if (!app) {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  }
  return app;
};

export const getDb = () => {
  if (!dbInstance) {
    const app = initializeFirebase();
    if (app) {
      try {
        dbInstance = initializeFirestore(app, {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager(),
          }),
        });
      } catch {
        dbInstance = getFirestore(app);
      }
    }
  }
  return dbInstance;
};

const getAuthInstance = () => {
  if (!authInstance) {
    const app = initializeFirebase();
    if (app) {
      authInstance = getAuth(app);
    }
  }
  return authInstance;
};

export const db = typeof window === 'undefined' ? null : getDb();
export const auth = typeof window === 'undefined' ? null : getAuthInstance();
export default initializeFirebase;
