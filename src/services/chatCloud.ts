import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { getFirebaseConfig } from '@/src/config/firebase';
import { getFirebaseAuth, getFirebaseFirestore } from '@/src/services/firebase';
import type { ChatAttachment, ChatMessage, ChatSession, GroupExpense } from '@/src/types/models';

const USERS = 'users';
const SESSIONS = 'advisor_sessions';
const MESSAGES = 'messages';

function sessionsCol(uid: string) {
  return collection(getFirebaseFirestore(), USERS, uid, SESSIONS);
}

function sessionRef(uid: string, sessionId: string) {
  return doc(getFirebaseFirestore(), USERS, uid, SESSIONS, sessionId);
}

function messagesCol(uid: string, sessionId: string) {
  return collection(getFirebaseFirestore(), USERS, uid, SESSIONS, sessionId, MESSAGES);
}

function messageRef(uid: string, sessionId: string, messageId: string) {
  return doc(getFirebaseFirestore(), USERS, uid, SESSIONS, sessionId, MESSAGES, messageId);
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

function messageFromDoc(sessionId: string, id: string, data: Record<string, unknown>): ChatMessage {
  let attachments: ChatAttachment[] | undefined;
  if (data.attachmentsJson) {
    try {
      attachments = JSON.parse(String(data.attachmentsJson)) as ChatAttachment[];
    } catch {
      attachments = undefined;
    }
  }
  return {
    id,
    sessionId,
    text: String(data.text ?? ''),
    isUser: Boolean(data.isUser),
    timestampMillis: Number(data.timestampMillis ?? Date.now()),
    attachments,
  };
}

export async function fetchChatSessions(uid: string): Promise<ChatSession[]> {
  const snap = await getDocs(sessionsCol(uid));
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        userEmail: String(data.userEmail ?? ''),
        title: String(data.title ?? 'New chat'),
        createdAtMillis: Number(data.createdAtMillis ?? 0),
        lastMessageAtMillis: Number(data.lastMessageAtMillis ?? 0),
      } satisfies ChatSession;
    })
    .sort((a, b) => b.lastMessageAtMillis - a.lastMessageAtMillis);
}

export async function createChatSession(uid: string, userEmail: string, title = 'New chat'): Promise<ChatSession> {
  const id = doc(sessionsCol(uid)).id;
  const now = Date.now();
  const session: Omit<ChatSession, 'id'> = {
    userEmail,
    title,
    createdAtMillis: now,
    lastMessageAtMillis: now,
  };
  await setDoc(sessionRef(uid, id), { ...session, updatedAt: serverTimestamp() });
  return { id, ...session };
}

export async function updateChatSessionTitle(uid: string, sessionId: string, title: string): Promise<void> {
  await setDoc(sessionRef(uid, sessionId), { title, updatedAt: serverTimestamp() }, { merge: true });
}

async function touchChatSession(uid: string, sessionId: string): Promise<void> {
  await setDoc(
    sessionRef(uid, sessionId),
    { lastMessageAtMillis: Date.now(), updatedAt: serverTimestamp() },
    { merge: true }
  );
}

export async function deleteChatSession(uid: string, sessionId: string): Promise<void> {
  const msgSnap = await getDocs(messagesCol(uid, sessionId));
  const batch = writeBatch(getFirebaseFirestore());
  msgSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(sessionRef(uid, sessionId));
  await batch.commit();
}

export async function fetchChatMessages(uid: string, sessionId: string): Promise<ChatMessage[]> {
  const snap = await getDocs(query(messagesCol(uid, sessionId), orderBy('timestampMillis', 'asc')));
  return snap.docs.map((d) => messageFromDoc(sessionId, d.id, d.data() as Record<string, unknown>));
}

export async function saveChatMessage(
  uid: string,
  message: Omit<ChatMessage, 'id'>,
  messageId?: string
): Promise<string> {
  const id = messageId ?? doc(messagesCol(uid, message.sessionId)).id;
  await setDoc(messageRef(uid, message.sessionId, id), {
    text: message.text,
    isUser: message.isUser,
    timestampMillis: message.timestampMillis,
    sessionId: message.sessionId,
    attachmentsJson: message.attachments?.length ? JSON.stringify(message.attachments) : null,
    updatedAt: serverTimestamp(),
  });
  await touchChatSession(uid, message.sessionId);
  return id;
}

export async function clearChatMessages(uid: string, sessionId: string): Promise<void> {
  const snap = await getDocs(messagesCol(uid, sessionId));
  const batch = writeBatch(getFirebaseFirestore());
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

function extFromMime(mimeType: string, fileName: string): string {
  if (mimeType.startsWith('image/')) return mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
  if (mimeType.startsWith('audio/')) return mimeType.split('/')[1] ?? 'm4a';
  const parts = fileName.split('.');
  return parts.length > 1 ? parts[parts.length - 1] : 'bin';
}

export async function uploadChatAttachment(
  uid: string,
  sessionId: string,
  messageId: string,
  localUri: string,
  mimeType: string,
  fileName: string
): Promise<string> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Not signed in.');

  const idToken = await user.getIdToken();
  const bucket = getFirebaseConfig().storageBucket;
  if (!bucket) throw new Error('Firebase Storage bucket is not configured.');

  const ext = extFromMime(mimeType, fileName);
  const objectPath = `${USERS}/${uid}/chat/${sessionId}/${messageId}_${Date.now()}.${ext}`;
  const uploadUrl =
    `https://firebasestorage.googleapis.com/v0/b/${bucket}/o` +
    `?uploadType=media&name=${encodeURIComponent(objectPath)}`;

  const result = await uploadFileViaXhr(uploadUrl, localUri, idToken, mimeType, fileName);
  const downloadToken = result.downloadTokens?.split(',')[0];
  if (!downloadToken) throw new Error('Upload succeeded but no download URL token was returned.');
  return buildDownloadUrl(bucket, objectPath, downloadToken);
}

export async function fetchAllGroupExpenses(uid: string): Promise<GroupExpense[]> {
  const snap = await getDocs(collection(getFirebaseFirestore(), USERS, uid, 'group_expenses'));
  return snap.docs
    .map((d) => {
      const data = d.data();
      const paidByNames = Array.isArray(data.paidByNames)
        ? data.paidByNames.map(String).filter(Boolean)
        : undefined;
      const splitAmongNames = Array.isArray(data.splitAmongNames)
        ? data.splitAmongNames.map(String).filter(Boolean)
        : undefined;
      return {
        id: d.id,
        userEmail: String(data.userEmail ?? ''),
        groupId: String(data.groupId ?? ''),
        title: String(data.title ?? ''),
        amount: Number(data.amount ?? 0),
        paidBy: paidByNames?.length ? paidByNames.join(', ') : String(data.paidBy ?? ''),
        paidByMemberId: data.paidByMemberId != null ? String(data.paidByMemberId) : null,
        paidByNames,
        paidByMemberIds: Array.isArray(data.paidByMemberIds)
          ? data.paidByMemberIds.map(String)
          : undefined,
        splitAmongNames,
        splitAmongMemberIds: Array.isArray(data.splitAmongMemberIds)
          ? data.splitAmongMemberIds.map(String)
          : undefined,
        splitType: String(data.splitType ?? 'EQUAL'),
        splitsJson: String(data.splitsJson ?? '{}'),
        dateMillis: Number(data.dateMillis ?? Date.now()),
      } satisfies GroupExpense;
    })
    .sort((a, b) => b.dateMillis - a.dateMillis);
}
