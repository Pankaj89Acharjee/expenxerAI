import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/services/firebase';

export type PushTabTarget = 'split' | 'expenses' | 'index' | 'planner' | 'advisor' | 'profile';

/** Remote push is unavailable in Expo Go on Android (SDK 53+). */
export function isPushNotificationsAvailable(): boolean {
  return !(isRunningInExpoGo() && Platform.OS === 'android');
}

type NotificationsModule = typeof import('expo-notifications');

let notificationsModule: NotificationsModule | null = null;
let handlerConfigured = false;

async function getNotifications(): Promise<NotificationsModule | null> {
  if (!isPushNotificationsAvailable()) return null;
  if (notificationsModule) return notificationsModule;
  notificationsModule = await import('expo-notifications');
  if (!handlerConfigured) {
    handlerConfigured = true;
    notificationsModule.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  }
  return notificationsModule;
}

function projectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID
  );
}

/** Request permission and return an Expo push token (or null). */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  if (!Device.isDevice) return null;

  const Notifications = await getNotifications();
  if (!Notifications) return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Expenxer',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const pid = projectId();
  const token = await Notifications.getExpoPushTokenAsync(
    pid ? { projectId: pid } : undefined
  );
  return token.data ?? null;
}

export async function saveExpoPushToken(uid: string, token: string | null): Promise<void> {
  await setDoc(
    doc(getFirebaseFirestore(), 'users', uid),
    { expoPushToken: token, updatedAt: Date.now() },
    { merge: true }
  );
}

async function fetchUserPushMeta(
  uid: string
): Promise<{ token: string | null; alertPreference: boolean }> {
  const snap = await getDoc(doc(getFirebaseFirestore(), 'users', uid));
  if (!snap.exists()) return { token: null, alertPreference: true };
  const data = snap.data() as Record<string, unknown>;
  return {
    token: data.expoPushToken != null ? String(data.expoPushToken) : null,
    alertPreference: data.alertPreference !== false,
  };
}

/** Send Expo push to one user if they have a token and alerts enabled. */
export async function sendPushToUser(
  uid: string,
  title: string,
  body: string,
  data?: { tab?: PushTabTarget; groupId?: string }
): Promise<void> {
  try {
    const { token, alertPreference } = await fetchUserPushMeta(uid);
    if (!token || !alertPreference) return;
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: token,
        sound: 'default',
        title,
        body,
        data: data ?? {},
      }),
    });
  } catch {
    // Best-effort — never block app flows on push failure.
  }
}

export async function sendPushToUsers(
  uids: string[],
  title: string,
  body: string,
  data?: { tab?: PushTabTarget; groupId?: string }
): Promise<void> {
  const unique = [...new Set(uids.filter(Boolean))];
  await Promise.all(unique.map((uid) => sendPushToUser(uid, title, body, data)));
}

/** Present immediate feedback on this device after a confirmed action succeeds. */
export async function presentExpenseLoggedNotification(
  title: string,
  amount: number,
  category: string
): Promise<void> {
  const Notifications = await getNotifications();
  if (!Notifications) return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Expense logged',
      body: `₹${amount.toLocaleString('en-IN')} at ${title} was added to ${category}.`,
      data: { tab: 'expenses' satisfies PushTabTarget },
    },
    trigger: null,
  });
}

export async function scheduleLocalReminderNotification(
  identifier: string,
  title: string,
  body: string,
  triggerMillis: number | null,
  data: { tab?: PushTabTarget; groupId?: string } = {}
): Promise<void> {
  if (Platform.OS === 'web') return;
  const Notifications = await getNotifications();
  if (!Notifications) return;
  await Notifications.cancelScheduledNotificationAsync(identifier);
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: { title, body, data, sound: 'default' },
    trigger: triggerMillis == null
      ? null
      : {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(triggerMillis),
        },
  });
}

export function tabFromNotificationType(type: string): PushTabTarget {
  const t = type.toUpperCase();
  if (t.includes('SPLIT')) return 'split';
  if (t.includes('EXPENSE') || t.includes('RECEIPT')) return 'expenses';
  if (t.includes('BILL') || t.includes('SUB') || t.includes('LOAN') || t.includes('PLANNER')) {
    return 'planner';
  }
  if (t.includes('ADVISOR') || t.includes('AI')) return 'advisor';
  if (t.includes('PROFILE') || t.includes('AUTH')) return 'profile';
  return 'index';
}

/** Subscribe to notification taps. No-ops in Expo Go on Android. */
export async function addNotificationResponseListener(
  listener: (tab: PushTabTarget | undefined) => void
): Promise<{ remove: () => void } | null> {
  const Notifications = await getNotifications();
  if (!Notifications) return null;
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as { tab?: PushTabTarget };
    listener(data?.tab);
  });
  return sub;
}
