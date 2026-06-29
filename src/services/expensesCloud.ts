import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { getFirebaseConfig } from '@/src/config/firebase';
import { getFirebaseAuth, getFirebaseFirestore } from '@/src/services/firebase';
import { expenseFromFirestore, expenseToFirestore } from '@/src/services/expenseMapper';
import type { Expense } from '@/src/types/models';

const USERS = 'users';
const EXPENSES = 'expenses';

function expensesCol(uid: string) {
  return collection(getFirebaseFirestore(), USERS, uid, EXPENSES);
}

function expenseRef(uid: string, expenseId: string) {
  return doc(getFirebaseFirestore(), USERS, uid, EXPENSES, expenseId);
}

type StorageUploadResponse = { downloadTokens?: string };

function buildDownloadUrl(bucket: string, objectPath: string, downloadToken: string): string {
  const encoded = encodeURIComponent(objectPath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encoded}?alt=media&token=${downloadToken}`;
}

function uploadFileViaXhr(
  uploadUrl: string,
  fileUri: string,
  idToken: string,
  contentType: string,
  fileName: string
): Promise<StorageUploadResponse> {
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
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.send({ uri: fileUri, type: contentType, name: fileName } as unknown as XMLHttpRequestBodyInit);
  });
}

export async function fetchCloudExpenses(uid: string): Promise<Expense[]> {
  const snap = await getDocs(expensesCol(uid));
  return snap.docs
    .map((d) => expenseFromFirestore(d.id, d.data() as Record<string, unknown>))
    .sort((a, b) => b.dateMillis - a.dateMillis);
}

export async function saveCloudExpense(
  uid: string,
  expense: Omit<Expense, 'id'>,
  expenseId?: string
): Promise<string> {
  const id = expenseId ?? doc(expensesCol(uid)).id;
  await setDoc(expenseRef(uid, id), {
    ...expenseToFirestore(expense),
    updatedAt: serverTimestamp(),
  });
  return id;
}

export async function deleteCloudExpense(uid: string, expenseId: string): Promise<void> {
  await deleteDoc(expenseRef(uid, expenseId));
}

export async function uploadReceiptPhoto(
  uid: string,
  expenseId: string,
  localUri: string
): Promise<string> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Not signed in.');

  const idToken = await user.getIdToken();
  const bucket = getFirebaseConfig().storageBucket;
  if (!bucket) throw new Error('Firebase Storage bucket is not configured.');

  const objectPath = `${USERS}/${uid}/receipts/${expenseId}.jpg`;
  const uploadUrl =
    `https://firebasestorage.googleapis.com/v0/b/${bucket}/o` +
    `?uploadType=media&name=${encodeURIComponent(objectPath)}`;

  const result = await uploadFileViaXhr(uploadUrl, localUri, idToken, 'image/jpeg', 'receipt.jpg');
  const downloadToken = result.downloadTokens?.split(',')[0];
  if (!downloadToken) {
    throw new Error('Upload succeeded but no download URL token was returned.');
  }

  return buildDownloadUrl(bucket, objectPath, downloadToken);
}
