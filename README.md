# FutureFund / Expenxer (Expo)

Cross-platform expense and wealth app — Expo/React Native port of the original Kotlin Jetpack Compose Android app (**ExpenseAI** workspace).

## Features

- **Authentication** — Firebase email/password (real accounts, persisted sessions)
- **Dashboard** — Savings hero card, AI tips, liability alerts, 7-day trend chart, category breakdown, savings goals, automation panel
- **Expenses** — Search, category filters, budget trackers, AI auto-categorization (Gemini), receipt scan simulation
- **Planner** — Annual liabilities, subscriptions, budget templates with apply-to-month
- **Split** — Group expense splitting with equal-split settlement engine
- **AI Advisor** — Gemini-powered financial coach chat with full context injection
- **Profile** — Avatar picker, income/savings rate, logout
- **Export** — CSV share, PDF print, Google Sheets sync (sandbox + real API), Gmail reports

## Tech Stack

| Android (Kotlin) | Expo (TypeScript) |
|------------------|-------------------|
| Jetpack Compose | React Native + Expo Router |
| Room + Flow | expo-sqlite |
| SharedPreferences | AsyncStorage + Firebase Auth persistence |
| FinancialViewModel | Zustand store |
| Gemini Retrofit | fetch API |
| Coil | expo-image |
| FileProvider + Print | expo-sharing + expo-print |

## Getting Started

```bash
cd futurefund-expo
npm install
cp .env.example .env
# Fill in EXPO_PUBLIC_GEMINI_API_KEY and Firebase keys (see below)
npm expo start

npx expo start

npx expo start -c --web #for clearing cache and starting application in web mode

npx expo start -c  #for clearing cache and starting application
```

Then press `a` for Android, `i` for iOS, or `w` for web.

## Firebase setup (email/password)

1. In [Firebase Console](https://console.firebase.google.com/) → **Authentication** → **Sign-in method**, enable **Email/Password**.
2. Copy `google-services.json` into `futurefund-expo/google-services.json` (optional for native builds; used as reference for env vars).
3. Open `google-services.json` and map values into `.env`:

| `.env` variable | `google-services.json` path |
|-----------------|----------------------------|
| `EXPO_PUBLIC_FIREBASE_API_KEY` | `client[0].api_key[0].current_key` |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | `{project_info.project_id}.firebaseapp.com` |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | `project_info.project_id` |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` | `project_info.storage_bucket` |
| `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `project_info.project_number` |
| `EXPO_PUBLIC_FIREBASE_APP_ID` | `client[0].client_info.mobilesdk_app_id` |

4. Restart Expo after editing `.env` (`npx expo start -c`).

**Note:** `client_secret.json` is for OAuth server flows (e.g. Google Sign-In on web). It is **not** needed for Firebase email/password auth. Do not commit it — it is listed in `.gitignore`.

## Environment

- `EXPO_PUBLIC_GEMINI_API_KEY` — AI chat coach and expense auto-categorization
- `EXPO_PUBLIC_FIREBASE_*` — Firebase web config (required for login)

Google Sheets/Gmail sync works in **sandbox mode** without a token (simulated). Provide a real OAuth bearer token in Dashboard → Gmail & Sync Settings for live API calls.

## Project Structure

```
futurefund-expo/
├── app/                    # Expo Router screens
│   ├── login.tsx
│   └── (tabs)/             # 6 bottom tabs
├── src/
│   ├── config/             # Firebase config helpers
│   ├── db/                 # SQLite schema + repository
│   ├── services/           # Firebase, Gemini, Google APIs
│   ├── store/              # Zustand state (ViewModel)
│   ├── theme/              # Color palette
│   └── utils/              # Export, settlements, format
```

## Original Android App

The Kotlin source remains in the parent `ExpenseAI/` directory. This Expo app is a feature-parity rebuild for iOS, Android, and web from a single codebase.

### EXPO Account Login - 

Id - ```pankaj89```
Pa - ```Pankaj#2026```