import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth } from '@/src/services/firebase';

export function subscribeToAuthChanges(listener: (user: User | null) => void): () => void {
  return onAuthStateChanged(getFirebaseAuth(), listener);
}

export async function registerWithEmail(
  email: string,
  password: string,
  displayName: string
): Promise<User> {
  const credential = await createUserWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
  if (displayName.trim()) {
    await updateProfile(credential.user, { displayName: displayName.trim() });
  }
  return credential.user;
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
  return credential.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(getFirebaseAuth());
}

export async function updateAuthDisplayName(displayName: string): Promise<void> {
  const user = getFirebaseAuth().currentUser;
  if (user && displayName.trim()) {
    await updateProfile(user, { displayName: displayName.trim() });
  }
}

export function mapFirebaseAuthError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/email-already-in-use':
      return 'This email is already registered. Try signing in instead.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    case 'auth/operation-not-allowed':
      return 'Email/password sign-in is not enabled in Firebase Console.';
    default:
      return (error as Error)?.message ?? 'Authentication failed. Please try again.';
  }
}
