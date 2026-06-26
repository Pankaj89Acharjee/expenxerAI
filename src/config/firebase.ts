import Constants from 'expo-constants';

export type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

function readConfig(): FirebaseWebConfig {
  const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;

  const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? extra?.firebaseApiKey ?? '';
  const authDomain = process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? extra?.firebaseAuthDomain ?? '';
  const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? extra?.firebaseProjectId ?? '';
  const storageBucket = process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? extra?.firebaseStorageBucket ?? '';
  const messagingSenderId =
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? extra?.firebaseMessagingSenderId ?? '';
  const appId = process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? extra?.firebaseAppId ?? '';

  return { apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId };
}

export function getFirebaseConfig(): FirebaseWebConfig {
  return readConfig();
}

export function isFirebaseConfigured(): boolean {
  const c = readConfig();
  return Boolean(c.apiKey && c.authDomain && c.projectId && c.appId);
}

/**
 * Maps fields from google-services.json (Android) to Firebase JS web config.
 * Use this if you only downloaded google-services.json and not the Web app config.
 */
export function configFromGoogleServices(json: {
  project_info: { project_number: string; project_id: string; storage_bucket?: string };
  client: Array<{
    client_info: { mobilesdk_app_id: string };
    api_key: Array<{ current_key: string }>;
  }>;
}): FirebaseWebConfig {
  const client = json.client[0];
  const projectId = json.project_info.project_id;
  return {
    apiKey: client.api_key[0]?.current_key ?? '',
    authDomain: `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: json.project_info.storage_bucket ?? `${projectId}.appspot.com`,
    messagingSenderId: json.project_info.project_number,
    appId: client.client_info.mobilesdk_app_id,
  };
}
