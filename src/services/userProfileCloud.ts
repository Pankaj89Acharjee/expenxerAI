import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirebaseConfig } from '@/src/config/firebase';
import { getFirebaseAuth, getFirebaseFirestore } from '@/src/services/firebase';
import type { UserProfile } from '@/src/types/models';

const USERS = 'users';

function profileRef(uid: string) {
  return doc(getFirebaseFirestore(), USERS, uid);
}

type CloudProfile = UserProfile & { updatedAt?: unknown };

type StorageUploadResponse = {
  downloadTokens?: string;
};

function buildDownloadUrl(bucket: string, objectPath: string, downloadToken: string): string {
  const encoded = encodeURIComponent(objectPath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encoded}?alt=media&token=${downloadToken}`;
}

function uploadFileViaXhr(uploadUrl: string, fileUri: string, idToken: string): Promise<StorageUploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(xhr.responseText || `Upload failed (${xhr.status})`));
        return;
      }
      try {
        resolve(JSON.parse(xhr.responseText) as StorageUploadResponse);
      } catch {
        reject(new Error('Invalid upload response from Storage.'));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload.'));
    xhr.open('POST', uploadUrl);
    xhr.setRequestHeader('Authorization', `Firebase ${idToken}`);
    xhr.setRequestHeader('Content-Type', 'image/jpeg');
    // React Native XHR accepts { uri, type, name } — avoids Blob/ArrayBuffer (unsupported on RN)
    xhr.send({ uri: fileUri, type: 'image/jpeg', name: 'avatar.jpg' } as unknown as XMLHttpRequestBodyInit);
  });
}

export async function fetchCloudProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(profileRef(uid));
  if (!snap.exists()) return null;

  const data = snap.data() as CloudProfile;
  return {
    email: data.email,
    displayName: data.displayName,
    photoUrl: data.photoUrl ?? null,
    monthlyIncome: data.monthlyIncome,
    baseSavingsRatePercent: data.baseSavingsRatePercent,
    alertPreference: data.alertPreference,
  };
}

export async function saveCloudProfile(uid: string, profile: UserProfile): Promise<void> {
  await setDoc(
    profileRef(uid),
    {
      email: profile.email,
      displayName: profile.displayName,
      photoUrl: profile.photoUrl ?? null,
      monthlyIncome: profile.monthlyIncome,
      baseSavingsRatePercent: profile.baseSavingsRatePercent,
      alertPreference: profile.alertPreference,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function uploadProfilePhoto(uid: string, localUri: string): Promise<string> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Not signed in.');

  const idToken = await user.getIdToken();
  const bucket = getFirebaseConfig().storageBucket;
  if (!bucket) throw new Error('Firebase Storage bucket is not configured.');

  const objectPath = `${USERS}/${uid}/avatar.jpg`;
  const uploadUrl =
    `https://firebasestorage.googleapis.com/v0/b/${bucket}/o` +
    `?uploadType=media&name=${encodeURIComponent(objectPath)}`;

  const result = await uploadFileViaXhr(uploadUrl, localUri, idToken);
  const downloadToken = result.downloadTokens?.split(',')[0];
  if (!downloadToken) {
    throw new Error('Upload succeeded but no download URL token was returned.');
  }

  return buildDownloadUrl(bucket, objectPath, downloadToken);
}
