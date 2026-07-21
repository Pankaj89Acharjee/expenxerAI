import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';

const PENDING_INVITE_KEY = 'pending_split_invite_code';

export function createSplitInviteDeepLink(code: string): string {
  return Linking.createURL(`invite/${code.trim().toUpperCase()}`);
}

export function parseInviteCodeFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = Linking.parse(url);
    const fromQuery = parsed.queryParams?.code ?? parsed.queryParams?.invite;
    if (typeof fromQuery === 'string' && fromQuery.trim()) {
      return fromQuery.trim().toUpperCase();
    }
    const path = (parsed.path ?? '').replace(/^\/+/, '');
    const parts = path.split('/').filter(Boolean);
    // Paths like invite/ABC123 or --/invite/ABC123
    const inviteIdx = parts.findIndex((p) => p.toLowerCase() === 'invite');
    if (inviteIdx >= 0 && parts[inviteIdx + 1]) {
      return parts[inviteIdx + 1].trim().toUpperCase();
    }
    if (parts.length === 1 && /^[A-Z0-9]{6,12}$/i.test(parts[0])) {
      return parts[0].trim().toUpperCase();
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

export async function savePendingInviteCode(code: string): Promise<void> {
  await AsyncStorage.setItem(PENDING_INVITE_KEY, code.trim().toUpperCase());
}

export async function peekPendingInviteCode(): Promise<string | null> {
  const code = await AsyncStorage.getItem(PENDING_INVITE_KEY);
  return code?.trim() ? code.trim().toUpperCase() : null;
}

export async function consumePendingInviteCode(): Promise<string | null> {
  const code = await peekPendingInviteCode();
  if (code) await AsyncStorage.removeItem(PENDING_INVITE_KEY);
  return code;
}
