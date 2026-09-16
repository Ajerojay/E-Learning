# LearnEase

LearnEase is a preschool e-learning app for **parents**, **kids**, and **teachers**. It is a React + Vite web app that can also run on Android through Capacitor.

Use this file to set up the project on a new computer after cloning from GitHub.

## What you need

- [Node.js](https://nodejs.org/) 20 or newer (includes `npm`)
- Git
- A `.env` file with the shared Supabase keys (ask a teammate; do not commit this file)

Optional, only if you will run the Android app:

- [Android Studio](https://developer.android.com/studio)
- An Android phone or emulator (API 24 / Android 7.0 or newer)
- JDK 17 (Android Studio usually installs this)

## 1. Clone and install

```bash
git clone https://github.com/Ajerojay/E-Learning.git
cd E-Learning
npm install
```

If the repo folder on your machine is named `e-learning`, `cd` into that folder instead.

## 2. Add environment variables

Create a file named `.env` in the **project root** (same folder as `package.json`):

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Get the real values from:

1. A teammate who already has the project running, or
2. [Supabase](https://supabase.com) → your project → **Project Settings** → **API**

Use the **anon / public** key, not the service role key.

`.env` is gitignored. Never commit it or paste the keys into chat or the README.

## 3. Run the web app

```bash
npm run dev
```

Then open:

**http://localhost:5174**

The Vite server is bound to port **5174** on all network interfaces so a phone on the same Wi‑Fi can also load it.

### Main screens

| Role | How to open it |
| --- | --- |
| Parent sign in | `/` or `/app/signin` |
| Parent sign up | `/signup` or `/app/signup` |
| Parent home | `/parent-dashboard` (after sign in) |
| Your child | `/parent-children` |
| Progress | `/parent-progress` |
| Kids PIN screen | **Enter kids PIN** on sign in, or `/student-access` |
| Kid home | `/student` (after a valid PIN) |
| Teacher | Sign in with a teacher account, then `/teacher-dashboard` |

Kids use the **4-digit PIN** set at parent sign up. Parents sign in with **username or email** and password.

## 4. Build the production web bundle

```bash
npm run build
npm run preview
```

`npm run build` compiles TypeScript and writes files to `dist/`. That folder is also what Capacitor copies into the Android app.

## 5. Android app (optional)

Do this after `npm install` and a working `.env`.

### Offline APK (app uses the last web build)

```bash
npm run android:offline
```

That runs `npm run build` and `npx cap sync android`. Then in **Android Studio**:

1. **File → Open** and select the `android` folder
2. Wait for Gradle sync
3. Pick a device or emulator
4. Click **Run**

### Live reload on a physical phone

Phone and computer must be on the **same Wi‑Fi**. USB debugging should be on.

1. Start the Vite server so the phone can reach it:

   ```bash
   npm run dev:android
   ```

2. In another terminal, replace the host IP in `package.json` (`android:live`) with **your computer’s LAN IP**, then run:

   ```bash
   npm run android:live
   ```

   Or open the `android` folder in Android Studio and run from there after `npx cap sync android`.

Live reload uses `http://YOUR_LAN_IP:5174`. If the phone shows a blank screen, check Windows Firewall, that Vite is running, and that the IP is current (`ipconfig` on Windows).

## Project layout

```
src/App.tsx                      Routes for parent, student, and teacher
src/MobileApp/pages/Parent/      Parent dashboard, child profile, progress
src/MobileApp/pages/Student/     Kid home, lessons, quests, level map
src/MobileApp/teacher/           Teacher portal
src/lib/supabase.ts              Supabase client
src/lib/supabaseAuth.ts          Parent sign in / sign up
src/lib/supabaseData.ts          Children, progress, lessons, announcements
android/                         Capacitor Android project
```

## Common problems

| Problem | What to try |
| --- | --- |
| Blank page or login always fails | Confirm `.env` exists in the project root, then stop and restart `npm run dev` |
| Port already in use | Close the other process using **5174**, or stop other Vite windows |
| Phone cannot open the laptop URL | Same Wi‑Fi, use the laptop LAN IP, allow Node/Vite through the firewall |
| `npm run build` fails | Run `npm install` again and fix any TypeScript errors shown in the terminal |
| Android Studio Gradle errors | Use JDK 17, **File → Sync Project with Gradle Files** |

## Git

```bash
git pull
git add .
git commit -m "Your message"
git push origin main
```

Do not commit `.env`, `node_modules`, or `dist`.
