import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import { getFirebaseConfig, isFirebaseConfigured } from '@/src/config/firebase';
import { createFirebaseAuth } from '@/src/services/createFirebaseAuth';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured()) {
    throw new Error(
      'Firebase is not configured. Add EXPO_PUBLIC_FIREBASE_* variables to your .env file (see .env.example).'
    );
  }
  if (!app) {
    app = getApps().length > 0 ? getApps()[0]! : initializeApp(getFirebaseConfig());
  }
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    auth = createFirebaseAuth(getFirebaseApp());
  }
  return auth;
}
