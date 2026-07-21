import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/services/firebase';
import type { GroupExpense, GroupSettlement, SplitGroup, SplitMember } from '@/src/types/models';

const SHARED_GROUPS = 'split_groups';
const USERS = 'users';

function sharedGroupsCol() {
  return collection(getFirebaseFirestore(), SHARED_GROUPS);
}

function sharedGroupDoc(groupId: string) {
  return doc(getFirebaseFirestore(), SHARED_GROUPS, groupId);
}

function sharedExpensesCol(groupId: string) {
  return collection(getFirebaseFirestore(), SHARED_GROUPS, groupId, 'expenses');
}

function sharedSettlementsCol(groupId: string) {
  return collection(getFirebaseFirestore(), SHARED_GROUPS, groupId, 'settlements');
}

function legacyGroupsCol(uid: string) {
  return collection(getFirebaseFirestore(), USERS, uid, 'split_groups');
}

function legacyExpensesCol(uid: string) {
  return collection(getFirebaseFirestore(), USERS, uid, 'group_expenses');
}

function mapMember(raw: unknown, index: number): SplitMember | null {
  if (typeof raw === 'string') {
    const name = raw.trim();
    if (!name) return null;
    return {
      id: `legacy_${index}_${name.toLowerCase().replace(/\s+/g, '_')}`,
      uid: null,
      displayName: name,
      email: null,
      phoneNumber: null,
      status: 'guest',
    };
  }
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  const displayName = String(m.displayName ?? m.name ?? '').trim();
  if (!displayName) return null;
  return {
    id: String(m.id ?? `member_${index}`),
    uid: m.uid != null ? String(m.uid) : null,
    displayName,
    email: m.email != null ? String(m.email) : null,
    phoneNumber: m.phoneNumber != null ? String(m.phoneNumber) : null,
    status: (m.status as SplitMember['status']) ?? (m.uid ? 'active' : 'guest'),
  };
}

function mapGroupDoc(id: string, data: Record<string, unknown>, legacyOwnerEmail?: string): SplitGroup {
  const rawMembers = Array.isArray(data.members)
    ? data.members
    : (() => {
        try {
          return JSON.parse(String(data.membersJson ?? '[]'));
        } catch {
          return [];
        }
      })();

  const members = (rawMembers as unknown[])
    .map((m, i) => mapMember(m, i))
    .filter((m): m is SplitMember => m != null);

  const memberUids = Array.isArray(data.memberUids)
    ? data.memberUids.map(String)
    : members.map((m) => m.uid).filter((u): u is string => Boolean(u));

  return {
    id,
    name: String(data.name ?? 'Group'),
    createdByUid: String(data.createdByUid ?? ''),
    createdByEmail: String(data.createdByEmail ?? data.userEmail ?? legacyOwnerEmail ?? ''),
    createdAtMillis: Number(data.createdAtMillis ?? Date.now()),
    members,
    memberUids,
    userEmail: data.userEmail != null ? String(data.userEmail) : legacyOwnerEmail,
  };
}

function mapExpenseDoc(id: string, data: Record<string, unknown>): GroupExpense {
  const paidByNames = Array.isArray(data.paidByNames)
    ? data.paidByNames.map(String).filter(Boolean)
    : undefined;
  const paidByMemberIds = Array.isArray(data.paidByMemberIds)
    ? data.paidByMemberIds.map(String).filter(Boolean)
    : undefined;
  const splitAmongNames = Array.isArray(data.splitAmongNames)
    ? data.splitAmongNames.map(String).filter(Boolean)
    : undefined;
  const splitAmongMemberIds = Array.isArray(data.splitAmongMemberIds)
    ? data.splitAmongMemberIds.map(String).filter(Boolean)
    : undefined;
  const paidBy =
    paidByNames && paidByNames.length > 0
      ? paidByNames.join(', ')
      : String(data.paidBy ?? '');
  return {
    id,
    userEmail: String(data.userEmail ?? ''),
    groupId: String(data.groupId ?? ''),
    title: String(data.title ?? ''),
    amount: Number(data.amount ?? 0),
    paidBy,
    paidByMemberId: data.paidByMemberId != null ? String(data.paidByMemberId) : null,
    paidByNames,
    paidByMemberIds,
    splitAmongNames,
    splitAmongMemberIds,
    splitType: String(data.splitType ?? 'EQUAL'),
    splitsJson: String(data.splitsJson ?? '{}'),
    dateMillis: Number(data.dateMillis ?? Date.now()),
  };
}

export async function fetchSharedGroupsForUser(uid: string, userEmail: string): Promise<SplitGroup[]> {
  const sharedSnap = await getDocs(
    query(sharedGroupsCol(), where('memberUids', 'array-contains', uid))
  );
  const shared = sharedSnap.docs.map((d) => mapGroupDoc(d.id, d.data() as Record<string, unknown>));

  // Legacy per-user groups (string members) — still shown to the owner.
  const legacySnap = await getDocs(legacyGroupsCol(uid));
  const legacy = legacySnap.docs.map((d) =>
    mapGroupDoc(d.id, d.data() as Record<string, unknown>, userEmail)
  );

  const byId = new Map<string, SplitGroup>();
  for (const g of [...legacy, ...shared]) byId.set(g.id, g);
  return [...byId.values()].sort((a, b) => b.createdAtMillis - a.createdAtMillis);
}

export async function fetchSharedGroupById(groupId: string): Promise<SplitGroup | null> {
  const snap = await getDoc(sharedGroupDoc(groupId));
  if (!snap.exists()) return null;
  return mapGroupDoc(snap.id, snap.data() as Record<string, unknown>);
}

export async function updateSharedGroupMembers(groupId: string, members: SplitMember[]): Promise<void> {
  const memberUids = [
    ...new Set(members.map((m) => m.uid).filter((u): u is string => Boolean(u))),
  ];
  await setDoc(
    sharedGroupDoc(groupId),
    {
      members,
      memberUids,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function createSharedGroup(input: {
  name: string;
  createdByUid: string;
  createdByEmail: string;
  members: SplitMember[];
}): Promise<string> {
  const memberUids = [
    ...new Set(
      input.members.map((m) => m.uid).filter((u): u is string => Boolean(u))
    ),
  ];
  if (!memberUids.includes(input.createdByUid)) {
    memberUids.push(input.createdByUid);
  }

  const ref = await addDoc(sharedGroupsCol(), {
    name: input.name.trim(),
    createdByUid: input.createdByUid,
    createdByEmail: input.createdByEmail,
    createdAtMillis: Date.now(),
    members: input.members,
    memberUids,
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function fetchSharedGroupExpenses(groupId: string): Promise<GroupExpense[]> {
  const snap = await getDocs(sharedExpensesCol(groupId));
  return snap.docs
    .map((d) => mapExpenseDoc(d.id, { ...(d.data() as Record<string, unknown>), groupId }))
    .sort((a, b) => b.dateMillis - a.dateMillis);
}

export async function fetchLegacyGroupExpenses(uid: string, groupId: string): Promise<GroupExpense[]> {
  const snap = await getDocs(query(legacyExpensesCol(uid), where('groupId', '==', groupId)));
  return snap.docs
    .map((d) => mapExpenseDoc(d.id, d.data() as Record<string, unknown>))
    .sort((a, b) => b.dateMillis - a.dateMillis);
}

export async function addSharedGroupExpense(
  groupId: string,
  expense: Omit<GroupExpense, 'id'>
): Promise<string> {
  const ref = await addDoc(sharedExpensesCol(groupId), {
    userEmail: expense.userEmail,
    groupId,
    title: expense.title,
    amount: expense.amount,
    paidBy: expense.paidBy,
    paidByMemberId: expense.paidByMemberId ?? null,
    paidByNames: expense.paidByNames ?? [],
    paidByMemberIds: expense.paidByMemberIds ?? [],
    splitAmongNames: expense.splitAmongNames ?? [],
    splitAmongMemberIds: expense.splitAmongMemberIds ?? [],
    splitType: expense.splitType,
    splitsJson: expense.splitsJson,
    dateMillis: expense.dateMillis,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function fetchAllSharedExpensesForUser(uid: string): Promise<GroupExpense[]> {
  const groups = await getDocs(query(sharedGroupsCol(), where('memberUids', 'array-contains', uid)));
  const nested = await Promise.all(groups.docs.map((g) => fetchSharedGroupExpenses(g.id)));
  return nested.flat().sort((a, b) => b.dateMillis - a.dateMillis);
}

/** Live updates for shared groups the user belongs to. */
export function subscribeSharedGroupsForUser(
  uid: string,
  onData: (groups: SplitGroup[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(sharedGroupsCol(), where('memberUids', 'array-contains', uid)),
    (snap) => {
      const groups = snap.docs
        .map((d) => mapGroupDoc(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => b.createdAtMillis - a.createdAtMillis);
      onData(groups);
    },
    (error) => onError?.(error)
  );
}

/** Live updates for expenses inside one shared group. */
export function subscribeSharedGroupExpenses(
  groupId: string,
  onData: (expenses: GroupExpense[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    sharedExpensesCol(groupId),
    (snap) => {
      const expenses = snap.docs
        .map((d) => mapExpenseDoc(d.id, { ...(d.data() as Record<string, unknown>), groupId }))
        .sort((a, b) => b.dateMillis - a.dateMillis);
      onData(expenses);
    },
    (error) => onError?.(error)
  );
}

function mapSettlementDoc(id: string, data: Record<string, unknown>, groupId: string): GroupSettlement {
  return {
    id,
    groupId,
    debtor: String(data.debtor ?? ''),
    creditor: String(data.creditor ?? ''),
    amount: Number(data.amount ?? 0),
    dateMillis: Number(data.dateMillis ?? Date.now()),
    recordedByUid: String(data.recordedByUid ?? ''),
    note: data.note != null ? String(data.note) : null,
  };
}

export async function addSharedGroupSettlement(
  groupId: string,
  settlement: Omit<GroupSettlement, 'id' | 'groupId'>
): Promise<string> {
  const ref = await addDoc(sharedSettlementsCol(groupId), {
    groupId,
    debtor: settlement.debtor,
    creditor: settlement.creditor,
    amount: settlement.amount,
    dateMillis: settlement.dateMillis,
    recordedByUid: settlement.recordedByUid,
    note: settlement.note ?? null,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export function subscribeSharedGroupSettlements(
  groupId: string,
  onData: (settlements: GroupSettlement[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    sharedSettlementsCol(groupId),
    (snap) => {
      const settlements = snap.docs
        .map((d) => mapSettlementDoc(d.id, d.data() as Record<string, unknown>, groupId))
        .sort((a, b) => b.dateMillis - a.dateMillis);
      onData(settlements);
    },
    (error) => onError?.(error)
  );
}

export async function removeSharedGroupMember(input: {
  groupId: string;
  memberId: string;
  actorUid: string;
}): Promise<void> {
  const group = await fetchSharedGroupById(input.groupId);
  if (!group) throw new Error('Group not found');
  if (!group.memberUids.includes(input.actorUid)) throw new Error('Not a group member');

  const target = group.members.find((m) => m.id === input.memberId);
  if (!target) throw new Error('Member not found');
  if (target.uid === input.actorUid) {
    throw new Error('Use Leave group to remove yourself');
  }
  if (target.uid && group.createdByUid !== input.actorUid) {
    throw new Error('Only the group creator can remove registered members');
  }

  const members = group.members.filter((m) => m.id !== input.memberId);
  await updateSharedGroupMembers(input.groupId, members);
}

export async function leaveSharedGroup(input: {
  groupId: string;
  uid: string;
}): Promise<void> {
  const group = await fetchSharedGroupById(input.groupId);
  if (!group) throw new Error('Group not found');

  const members = group.members.filter((m) => m.uid !== input.uid);
  const remainingUids = members.map((m) => m.uid).filter((u): u is string => Boolean(u));

  if (remainingUids.length === 0) {
    await deleteDoc(sharedGroupDoc(input.groupId));
    return;
  }

  const patch: Record<string, unknown> = {
    members,
    memberUids: remainingUids,
    updatedAt: serverTimestamp(),
  };

  // If the admin leaves, transfer admin to the next registered member.
  if (group.createdByUid === input.uid) {
    const nextAdmin = members.find((m) => m.uid);
    if (nextAdmin?.uid) {
      patch.createdByUid = nextAdmin.uid;
      patch.createdByEmail = nextAdmin.email ?? group.createdByEmail;
    }
  }

  await setDoc(sharedGroupDoc(input.groupId), patch, { merge: true });
}

export function buildActiveMemberFromProfile(input: {
  uid: string;
  displayName: string;
  email: string;
  phoneNumber?: string | null;
}): SplitMember {
  return {
    id: input.uid,
    uid: input.uid,
    displayName: input.displayName.trim() || input.email.split('@')[0],
    email: input.email,
    phoneNumber: input.phoneNumber ?? null,
    status: 'active',
  };
}

export function buildGuestMember(input: {
  displayName: string;
  phoneNumber?: string | null;
  email?: string | null;
}): SplitMember {
  const id = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    uid: null,
    displayName: input.displayName.trim(),
    email: input.email ?? null,
    phoneNumber: input.phoneNumber ?? null,
    status: 'guest',
  };
}

/** Optional: stamp searchKeys on an existing profile doc without full rewrite. */
export async function ensureUserSearchKeys(uid: string, profile: {
  displayName: string;
  email: string;
  phoneNumber?: string | null;
}): Promise<void> {
  const { buildProfileSearchKeys } = await import('@/src/utils/userSearchKeys');
  await setDoc(
    doc(getFirebaseFirestore(), USERS, uid),
    {
      searchKeys: buildProfileSearchKeys(profile),
      phoneNumber: profile.phoneNumber ?? null,
      displayName: profile.displayName,
      email: profile.email,
    },
    { merge: true }
  );
}
