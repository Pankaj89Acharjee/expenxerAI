import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FirebaseApp } from 'firebase/app';
import { getAuth, initializeAuth, type Auth } from 'firebase/auth';

export function createFirebaseAuth(app: FirebaseApp): Auth {
  try {
    const { getReactNativePersistence } = require('firebase/auth') as {
      getReactNativePersistence: (storage: typeof AsyncStorage) => unknown;
    };
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    } as any);
  } catch {
    return getAuth(app);
  }
}
