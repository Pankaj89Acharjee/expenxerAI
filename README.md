# FutureFund / Expenxer (Expo)

Cross-platform expense and wealth app — Expo/React Native port of the original Kotlin Jetpack Compose Android app (**ExpenseAI** workspace).

## Features

- **Authentication** — Firebase email/password (real accounts, persisted sessions)
- **Dashboard** — Savings hero card, AI tips, liability alerts, 7-day trend chart, category breakdown, savings goals, automation panel
- **Expenses** — Search, category filters, budget trackers, AI auto-categorization (Gemini), receipt scan simulation
- **Planner** — Annual liabilities, subscriptions, budget templates with apply-to-month
- **Split** — Group expense splitting with equal-split settlement engine
- **AI Advisor** — Gemini-powered financial coach chat with full context injection
- **Profile** — Gallery photo upload (Firebase Storage), income/savings rate, alerts, cloud sync (Firestore)
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

## Firestore + Storage (user profile sync)

Profile data syncs to **`users/{firebaseAuthUid}`** in Firestore. Profile photos upload to **`users/{uid}/avatar.jpg`** in Storage.

1. Enable **Firestore** and **Storage** in Firebase Console.
2. Publish Firestore rules (see earlier `users/{userId}` rules).
3. In **Storage → Rules**, publish:

**Firestore rules (development trial — convert to production later):**

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
  	match /users/{userId} {
    	allow read, write: if request.auth != null && request.auth.uid == userId;
      
      match /{document=**} {
      	allow read, write: if request.auth != null && request.auth.uid == userId; 
      }
    }

    // This rule allows anyone with your Firestore database reference to view, edit,
    // and delete all data in your Firestore database. It is useful for getting
    // started, but it is configured to expire after 30 days because it
    // leaves your app open to attackers. At that time, all client
    // requests to your Firestore database will be denied.
    //
    // Make sure to write security rules for your app before that time, or else
    // all client requests to your Firestore database will be denied until you Update
    // your rules
    // match /{document=**} {
    //   allow read, write: if request.time < timestamp.date(2026, 7, 29);
    // }
  }
}
```


**Storage rules:**

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

4. Add the same `EXPO_PUBLIC_FIREBASE_*` vars (including `STORAGE_BUCKET`) to **EAS Environment variables** for production APK builds.

On login, the app pulls the cloud profile into local SQLite. On save/upload, it writes to both.

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

### EXPO Account Login

- **Id:** `pankaj89`
- **Password:** `Pankaj#2026`

### For Building Production Grade application in EXPO Cloud

Run the command to build in Expo Website:

```bash
eas build --platform android --profile production
```

For that you should be logged into EAS. Type command:

```bash
eas login
```

Then provide login credentials as above provided.

If EAS CLI is not installed, install it by:

```bash
npm install -g eas-cli
```

**Note:** Always keep `package-lock.json` in sync with `package.json`. `npm ci` is used in the build process, so any mismatch will trigger an error. In that case remove `node_modules` and `package-lock.json`. On Windows:

```bash
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item package-lock.json -ErrorAction SilentlyContinue
npm install
```

Then commit and push the code to GitHub and run the EAS build again:

```bash
eas build --platform android --profile production
```

### Local Android APK Build Guide (Without Android Studio)

This guide documents the exact process used to successfully build an Android APK locally on Windows 10 for an **Expo SDK 56** project **without** installing the heavy Android Studio IDE.

---

## 🛠️ Step 1: Manual Environment Architecture Setup

### 1. Download & Structure the Android SDK
Instead of installing Android Studio, we download the lightweight **command-line** tools.
1. Go to the Android Studio Downloads page and download the **"Command line tools only"** Windows `.zip`.
2. Create a permanent system directory at: `C:\Android\SDK`
3. Inside it, create the required nested subfolders: `C:\Android\SDK\cmdline-tools\latest`
4. Extract the downloaded `.zip` file contents (`bin`, `lib`, `source.properties`, `NOTICE.txt`) directly into that `latest` folder.

![Description](./screenshots/Android1.png)


### 2. Configure Windows System Environment Variables
To make the tools accessible globally across terminals (like Cursor or standard `cmd`), update the environment paths:
1. Open **Edit the system environment variables** in Windows. In Windows button type **Environment Variables** and then open by clicking on the Environment Varibles at the bottom-right corner.

![Description](./screenshots/Envvariables.png)

2. Under **User Variables**, add a new variable:
   * **Variable Name:** `ANDROID_HOME`
   * **Variable Value:** `C:\Android\SDK`

![Description](./screenshots/Envvariables2.png)

3. Edit the existing **`Path`** variable and append these three separate lines to the bottom:
   * `%ANDROID_HOME%\cmdline-tools\latest\bin`
   * `%ANDROID_HOME%\platform-tools`
   * `%ANDROID_HOME%\build-tools\36.0.0`

![Environment Varibles Setup](./screenshots/Envvariables3.png)

---

## ⚠️ Stumbling Blocks & Resolution Logs (Troubleshooting)

During this setup, we ran into two critical alignment roadblocks that were manually debugged and resolved:

### Block 1: Java Version Mismatch (`java -version` crashed the build)
* **The Issue:** The computer originally ran **Java 25 (OpenJDK Temurin-25)**. While modern, **Java 25** is completely incompatible with the Android Gradle Plugin bundled in Expo SDK 56. Running a build on Java 25 triggers an immediate `Unsupported class file major version` terminal failure.
* **The Fix:** We downgraded the local runtime environment strictly to **Java 17 (OpenJDK Temurin-17)**.
* **Verification:** Open a fresh `cmd` and execute:
  ```cmd
  java -version
  ```
  It must output `openjdk version "17.0.x"`.

### Block 2: Expo SDK 56 Target Alignment
* **The Issue:** Default guides often request downloading Android Build Tools 34. However, **Expo SDK 56 requires Android API Level 36**.
* **The Fix:** We targeted the specific version packages inside the command line downloader tool and updated our environmental variables to watch version `36.0.0`.

---

## 🚀 Step 2: Fetch Dependencies via CLI

With your environment variables mapped, open a new Windows Command Prompt (`cmd`) and run this command to install the required API Level 36 dependencies:

```cmd
sdkmanager --install "platforms;android-36" "build-tools;36.0.0" "platform-tools"
```
*(Type `y` and hit Enter when prompted to accept the developer license agreements).*

---

## 💻 Step 3: Install OpenJDK 17
1. Download the Windows x64 Installer for OpenJDK 17 (LTS) from: https://adoptium.net/

2. Run installer and install default.

3. Check installation from ``cmd`` using 
```cmd
java -version
```



## 💻 Step 4: Run the Local Expo Compile Process

1. Open your project folder directly inside **Cursor** with **Command Prompt (cmd)** in the terminal.
2. Run the following deployment script:

```cmd
:: 1. Wipe old configurations and generate the native /android framework files
npx expo prebuild --clean

:: 2. Shift directory into the newly generated native layer
cd android

:: 3. Run the local Gradle assembler wrapper to build the standalone binary
gradlew assembleRelease
```

---

## 📦 Where to Find Your Completed APK

Once the terminal screen prints a green `BUILD SUCCESSFUL` announcement, your standalone application installer can be located directly in your Cursor file directory tree under:

`futurefund-expo/android/app/build/outputs/apk/release/app-release.apk`

Right-click the `app-release.apk` file inside Cursor and select **Reveal in File Explorer** to transfer it to a physical device for runtime testing!







### Future Project Expansions Plan

1. A comparison line chart where line A shows usual spending trends and line B shows current month's spending trend.

2. AI/ML intergration for detecting spikes in expenditure and alert user on that category and when usually occurs throughout the year.

3. Use `Gemini Vision` for reading bill and returning structured fields in one step when adding a new expenditure from an uploaded bill.