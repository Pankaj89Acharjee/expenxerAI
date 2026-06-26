import type { FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

export function createFirebaseAuth(app: FirebaseApp): Auth {
  return getAuth(app);
}
