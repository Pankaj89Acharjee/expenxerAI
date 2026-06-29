import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getFirebaseConfig, isFirebaseConfigured } from '@/src/config/firebase';
import { createFirebaseAuth } from '@/src/services/createFirebaseAuth';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let firestore: Firestore | null = null;
let storage: FirebaseStorage | null = null;

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

export function getFirebaseFirestore(): Firestore {
  if (!firestore) {
    firestore = getFirestore(getFirebaseApp());
  }
  return firestore;
}

export function getFirebaseStorage(): FirebaseStorage {
  if (!storage) {
    storage = getStorage(getFirebaseApp());
  }
  return storage;
}
