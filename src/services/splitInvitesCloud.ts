import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/services/firebase';
import {
  buildActiveMemberFromProfile,
  buildGuestMember,
  fetchSharedGroupById,
  updateSharedGroupMembers,
} from '@/src/services/splitGroupsCloud';
import type { SplitInvite, SplitMember, UserProfile } from '@/src/types/models';
import { normalizePhoneDigits, normalizeSearchToken } from '@/src/utils/userSearchKeys';

const INVITES = 'split_invites';

function invitesCol() {
  return collection(getFirebaseFirestore(), INVITES);
}

function inviteDoc(code: string) {
  return doc(getFirebaseFirestore(), INVITES, code);
}

function generateInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export function buildInviteClaimKeys(input: {
  phoneNumber?: string | null;
  email?: string | null;
}): string[] {
  const keys = new Set<string>();
  const phone = normalizePhoneDigits(input.phoneNumber);
  if (phone) {
    keys.add(phone);
    if (phone.length === 10) keys.add(`91${phone}`);
    if (phone.length === 12 && phone.startsWith('91')) keys.add(phone.slice(2));
  }
  const email = normalizeSearchToken(input.email ?? '');
  if (email) keys.add(email);
  return [...keys];
}

function mapInvite(code: string, data: Record<string, unknown>): SplitInvite {
  return {
    code,
    groupId: String(data.groupId ?? ''),
    groupName: String(data.groupName ?? ''),
    guestMemberId: data.guestMemberId != null ? String(data.guestMemberId) : null,
    invitedDisplayName: data.invitedDisplayName != null ? String(data.invitedDisplayName) : null,
    invitedPhone: data.invitedPhone != null ? String(data.invitedPhone) : null,
    invitedEmail: data.invitedEmail != null ? String(data.invitedEmail) : null,
    claimKeys: Array.isArray(data.claimKeys) ? data.claimKeys.map(String) : [],
    createdByUid: String(data.createdByUid ?? ''),
    createdAtMillis: Number(data.createdAtMillis ?? Date.now()),
    status: (data.status as SplitInvite['status']) ?? 'pending',
    claimedByUid: data.claimedByUid != null ? String(data.claimedByUid) : null,
    claimedAtMillis: data.claimedAtMillis != null ? Number(data.claimedAtMillis) : null,
  };
}

export async function fetchInviteByCode(code: string): Promise<SplitInvite | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
  const snap = await getDoc(inviteDoc(normalized));
  if (!snap.exists()) return null;
  return mapInvite(snap.id, snap.data() as Record<string, unknown>);
}

export async function createSplitInvite(input: {
  groupId: string;
  groupName: string;
  createdByUid: string;
  guestMemberId?: string | null;
  invitedDisplayName?: string | null;
  invitedPhone?: string | null;
  invitedEmail?: string | null;
}): Promise<SplitInvite> {
  const code = generateInviteCode();
  const claimKeys = buildInviteClaimKeys({
    phoneNumber: input.invitedPhone,
    email: input.invitedEmail,
  });
  const payload = {
    groupId: input.groupId,
    groupName: input.groupName,
    guestMemberId: input.guestMemberId ?? null,
    invitedDisplayName: input.invitedDisplayName ?? null,
    invitedPhone: input.invitedPhone ?? null,
    invitedEmail: input.invitedEmail ?? null,
    claimKeys,
    createdByUid: input.createdByUid,
    createdAtMillis: Date.now(),
    status: 'pending' as const,
    claimedByUid: null,
    claimedAtMillis: null,
    updatedAt: serverTimestamp(),
  };
  await setDoc(inviteDoc(code), payload);
  return mapInvite(code, payload);
}

async function findPendingInvitesForProfile(
  profile: Pick<UserProfile, 'email' | 'phoneNumber'>
): Promise<SplitInvite[]> {
  const keys = buildInviteClaimKeys({
    phoneNumber: profile.phoneNumber,
    email: profile.email,
  });
  if (keys.length === 0) return [];

  const results = new Map<string, SplitInvite>();
  await Promise.all(
    keys.slice(0, 4).map(async (key) => {
      const snap = await getDocs(
        query(
          invitesCol(),
          where('claimKeys', 'array-contains', key),
          where('status', '==', 'pending'),
          limit(10)
        )
      );
      snap.docs.forEach((d) => {
        results.set(d.id, mapInvite(d.id, d.data() as Record<string, unknown>));
      });
    })
  );
  return [...results.values()];
}

function mergeMemberIntoGroup(
  members: SplitMember[],
  invite: SplitInvite,
  uid: string,
  profile: UserProfile
): SplitMember[] {
  const active = buildActiveMemberFromProfile({
    uid,
    displayName: profile.displayName,
    email: profile.email,
    phoneNumber: profile.phoneNumber,
  });

  if (invite.guestMemberId) {
    let replaced = false;
    const next = members.map((m) => {
      if (m.id !== invite.guestMemberId) return m;
      replaced = true;
      return {
        ...active,
        id: m.id,
        displayName: profile.displayName?.trim() || m.displayName,
        phoneNumber: profile.phoneNumber ?? m.phoneNumber,
      };
    });
    if (replaced) return next;
  }

  const phone = normalizePhoneDigits(profile.phoneNumber);
  const invitePhone = normalizePhoneDigits(invite.invitedPhone);
  let matched = false;
  const next = members.map((m) => {
    if (m.uid) return m;
    const samePhone =
      Boolean(phone) &&
      Boolean(normalizePhoneDigits(m.phoneNumber)) &&
      (normalizePhoneDigits(m.phoneNumber) === phone ||
        (Boolean(invitePhone) && normalizePhoneDigits(m.phoneNumber) === invitePhone));
    const sameName =
      Boolean(invite.invitedDisplayName) &&
      m.displayName.trim().toLowerCase() === invite.invitedDisplayName!.trim().toLowerCase();
    if (samePhone || sameName) {
      matched = true;
      return {
        ...active,
        id: m.id,
        displayName: profile.displayName?.trim() || m.displayName,
        phoneNumber: profile.phoneNumber ?? m.phoneNumber,
      };
    }
    return m;
  });
  if (matched) return next;

  if (members.some((m) => m.uid === uid)) {
    return members.map((m) => (m.uid === uid ? { ...m, ...active, id: m.id } : m));
  }
  return [...members, active];
}

export async function claimSplitInvite(input: {
  code: string;
  uid: string;
  profile: UserProfile;
}): Promise<{ groupId: string; groupName: string } | null> {
  const invite = await fetchInviteByCode(input.code);
  if (!invite || invite.status !== 'pending') return null;
  if (invite.createdByUid === input.uid) {
    return { groupId: invite.groupId, groupName: invite.groupName };
  }

  const group = await fetchSharedGroupById(invite.groupId);
  if (!group) return null;

  const members = mergeMemberIntoGroup(group.members, invite, input.uid, input.profile);
  await updateSharedGroupMembers(invite.groupId, members);
  await updateDoc(inviteDoc(invite.code), {
    status: 'claimed',
    claimedByUid: input.uid,
    claimedAtMillis: Date.now(),
    updatedAt: serverTimestamp(),
  });
  return { groupId: invite.groupId, groupName: invite.groupName };
}

export async function claimPendingSplitInvites(input: {
  uid: string;
  profile: UserProfile;
  preferCode?: string | null;
}): Promise<{ groupId: string; groupName: string }[]> {
  const claimed: { groupId: string; groupName: string }[] = [];
  const seenGroups = new Set<string>();

  if (input.preferCode) {
    const result = await claimSplitInvite({
      code: input.preferCode,
      uid: input.uid,
      profile: input.profile,
    });
    if (result && !seenGroups.has(result.groupId)) {
      seenGroups.add(result.groupId);
      claimed.push(result);
    }
  }

  const pending = await findPendingInvitesForProfile(input.profile);
  for (const invite of pending) {
    if (seenGroups.has(invite.groupId)) continue;
    const result = await claimSplitInvite({
      code: invite.code,
      uid: input.uid,
      profile: input.profile,
    });
    if (result && !seenGroups.has(result.groupId)) {
      seenGroups.add(result.groupId);
      claimed.push(result);
    }
  }

  return claimed;
}

export async function prepareGuestInvite(input: {
  groupId: string;
  createdByUid: string;
  displayName: string;
  phoneNumber?: string | null;
  email?: string | null;
  existingMemberId?: string | null;
}): Promise<{ invite: SplitInvite; member: SplitMember }> {
  const group = await fetchSharedGroupById(input.groupId);
  if (!group) throw new Error('Group not found');

  let member: SplitMember | undefined;
  if (input.existingMemberId) {
    member = group.members.find((m) => m.id === input.existingMemberId);
  }

  if (!member) {
    const phone = normalizePhoneDigits(input.phoneNumber);
    member = group.members.find((m) => {
      if (m.uid) return false;
      if (phone && normalizePhoneDigits(m.phoneNumber) === phone) return true;
      return m.displayName.trim().toLowerCase() === input.displayName.trim().toLowerCase();
    });
  }

  let members = group.members;
  if (!member) {
    member = {
      ...buildGuestMember({
        displayName: input.displayName,
        phoneNumber: input.phoneNumber,
        email: input.email,
      }),
      status: 'invited',
    };
    members = [...members, member];
    await updateSharedGroupMembers(input.groupId, members);
  } else if (!member.uid) {
    members = members.map((m) =>
      m.id === member!.id
        ? {
            ...m,
            phoneNumber: input.phoneNumber ?? m.phoneNumber,
            email: input.email ?? m.email,
            status: 'invited' as const,
          }
        : m
    );
    member = members.find((m) => m.id === member!.id)!;
    await updateSharedGroupMembers(input.groupId, members);
  }

  const invite = await createSplitInvite({
    groupId: group.id,
    groupName: group.name,
    createdByUid: input.createdByUid,
    guestMemberId: member.id,
    invitedDisplayName: member.displayName,
    invitedPhone: member.phoneNumber ?? input.phoneNumber,
    invitedEmail: member.email ?? input.email,
  });

  return { invite, member };
}
