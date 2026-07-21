import { Linking, Platform, Share } from 'react-native';
import { createSplitInviteDeepLink } from '@/src/utils/inviteLink';
import { normalizePhoneDigits } from '@/src/utils/userSearchKeys';

export function buildWhatsAppInviteMessage(input: {
  groupName: string;
  inviterName: string;
  inviteCode: string;
}): string {
  const link = createSplitInviteDeepLink(input.inviteCode);
  return (
    `Hi! ${input.inviterName} invited you to the split group "${input.groupName}" on FutureFund / Expenxer.\n\n` +
    `Open this link after installing the app:\n${link}\n\n` +
    `Or sign up / log in and use invite code: ${input.inviteCode}`
  );
}

function toWhatsAppPhone(phone: string): string | null {
  const digits = normalizePhoneDigits(phone);
  if (!digits) return null;
  if (digits.length === 10) return `91${digits}`;
  if (digits.length >= 11) return digits;
  return null;
}

/**
 * Opens WhatsApp with a prefilled invite when a phone is provided;
 * otherwise falls back to the system share sheet (copy / other apps).
 */
export async function shareSplitInvite(input: {
  groupName: string;
  inviterName: string;
  inviteCode: string;
  phoneNumber?: string | null;
}): Promise<'whatsapp' | 'share'> {
  const message = buildWhatsAppInviteMessage(input);
  const waPhone = input.phoneNumber ? toWhatsAppPhone(input.phoneNumber) : null;

  if (waPhone) {
    const url = `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`;
    const canOpen = await Linking.canOpenURL(url).catch(() => Platform.OS !== 'web');
    if (canOpen) {
      await Linking.openURL(url);
      return 'whatsapp';
    }
  }

  await Share.share({ message, title: `Invite to ${input.groupName}` });
  return 'share';
}
