import {
  collection,
  getDocs,
  limit,
  query,
  where,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/services/firebase';
import type { UserDirectoryHit } from '@/src/types/models';
import { queryToSearchKey } from '@/src/utils/userSearchKeys';

const USERS = 'users';

/**
 * Search registered users by name / email / phone.
 * Requires Firestore rules allowing authenticated reads on `users` (or at least searchKeys + public fields).
 * Create a single-field index is not needed for array-contains.
 */
export async function searchRegisteredUsers(
  rawQuery: string,
  options?: { excludeUid?: string; max?: number }
): Promise<UserDirectoryHit[]> {
  const key = queryToSearchKey(rawQuery);
  if (key.length < 2) return [];

  const max = options?.max ?? 20;
  const q = query(
    collection(getFirebaseFirestore(), USERS),
    where('searchKeys', 'array-contains', key),
    limit(max)
  );
  const snap = await getDocs(q);

  return snap.docs
    .filter((d) => d.id !== options?.excludeUid)
    .map((d) => {
      const data = d.data();
      return {
        uid: d.id,
        displayName: String(data.displayName ?? data.email ?? 'User'),
        email: String(data.email ?? ''),
        phoneNumber: data.phoneNumber != null ? String(data.phoneNumber) : null,
        photoUrl: data.photoUrl != null ? String(data.photoUrl) : null,
      } satisfies UserDirectoryHit;
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}
