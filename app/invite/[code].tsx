import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useFinancialStore } from '@/src/store/useFinancialStore';
import { savePendingInviteCode } from '@/src/utils/inviteLink';

/**
 * Deep-link landing: futurefundexpo://invite/CODE (or Expo Go equivalent).
 * Stores the code, claims if already signed in, otherwise login flow claims after auth.
 */
export default function InviteLandingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string }>();
  const currentUserEmail = useFinancialStore((s) => s.currentUserEmail);
  const claimPendingInvites = useFinancialStore((s) => s.claimPendingInvites);
  const selectGroup = useFinancialStore((s) => s.selectGroup);
  const [message, setMessage] = useState('Opening invite…');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const raw = Array.isArray(params.code) ? params.code[0] : params.code;
      const code = (raw ?? '').trim().toUpperCase();
      if (!code) {
        setMessage('Invalid invite link.');
        setTimeout(() => router.replace(currentUserEmail ? '/(tabs)/split' : '/login'), 1200);
        return;
      }

      await savePendingInviteCode(code);
      if (!currentUserEmail) {
        setMessage('Invite saved. Sign in or register to join the group.');
        setTimeout(() => {
          if (!cancelled) router.replace('/login');
        }, 900);
        return;
      }

      try {
        const claimed = await claimPendingInvites();
        const hit = claimed[0];
        if (hit) {
          setMessage(`Joined "${hit.groupName}".`);
          await selectGroup(hit.groupId);
        } else {
          setMessage('Invite ready. Opening Split…');
        }
      } catch {
        setMessage('Could not claim invite right now. Opening Split…');
      }
      if (!cancelled) {
        setTimeout(() => router.replace('/(tabs)/split'), 700);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.code, currentUserEmail, claimPendingInvites, selectGroup, router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', padding: 24 }}>
      <ActivityIndicator color="#10B981" size="large" />
      <Text style={{ color: '#E5E7EB', marginTop: 16, textAlign: 'center' }}>{message}</Text>
    </View>
  );
}
