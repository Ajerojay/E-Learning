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

Use this for a packaged install that does **not** pick up file saves until you build again.

```bash
npm run android:offline
```

That runs `npm run build` and `npx cap sync android`. Then in **Android Studio**:

1. **File → Open** and select the `android` folder (not the repo root)
2. Wait for Gradle sync to finish
3. Pick a device or emulator in the device dropdown
4. Click **Run** (green play)

---

### Live reload in Android Studio (see code changes on the phone)

This is the flow to use while you are coding. The Android WebView loads Vite at **http://YOUR_LAN_IP:5174**, so saving a file in Cursor updates the app without a new APK.

**Need:** Android Studio, USB debugging (phone) or an emulator, and the phone/emulator able to reach your PC (same Wi‑Fi for a physical phone).

#### Step 1 — Enable the phone (skip if you use an emulator)

1. On the phone: **Settings → About phone** → tap **Build number** 7 times
2. **Settings → Developer options** → turn on **USB debugging**
3. Plug in USB, accept the **Allow USB debugging** prompt
4. Keep the phone awake and unlocked

#### Step 2 — Start Vite and leave it running

In the project root (`e-learning`), PowerShell:

```powershell
npm.cmd run dev:android
```

(`npm.cmd` avoids a Windows error where PowerShell blocks `npm.ps1`.)

If you prefer to allow npm scripts in PowerShell for this user account (one time):

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Then `npm run dev:android` works as usual.

Leave this terminal open. You should see something like:

```
Local:   http://localhost:5174/
Network: http://192.168.x.x:5174/
```

The **Network** address is what the phone will use. If you only see Local, that is still OK as long as the next step can detect your LAN IP.

If you get **Port 5174 is already in use**, Vite is already running. Do **not** start a second server. Leave that other terminal open and continue to Step 3. To start fresh, stop the old Vite window with `Ctrl+C`, or run:

```powershell
netstat -ano | findstr :5174
taskkill /PID <the_pid> /F
```

Then run `npm.cmd run dev:android` again.

#### Step 3 — Point the Android project at that Vite server

Open a **second** PowerShell in the **same project root**. Do **not** close the Vite window.

```powershell
$env:CAP_LIVE="1"
npx.cmd cap sync android
```

`CAP_LIVE=1` writes your current Wi‑Fi IPv4 into Capacitor (`capacitor.config.ts`) so the app loads the live site instead of `dist/`.

If your laptop IP changed (new Wi‑Fi, VPN), run those two lines again.

#### Step 4 — Run from Android Studio

1. Open **Android Studio**
2. **File → Open** → choose `c:\xampp\htdocs\e-learning\android` (the `android` folder)
3. Wait until Gradle sync finishes (bottom status bar)
4. Select your phone or emulator in the device list (top toolbar)
5. Click **Run** (green play) or **Shift+F10**

The first launch can take a few minutes. After that, keep **both** Android Studio and the `npm run dev:android` terminal running.

#### Step 5 — Confirm live updates

1. Change a React/CSS file (for example the Great Job popup) and **save**
2. The app WebView should refresh by itself
3. If it does not, pull down to refresh is not available — press **Run** again, or reload after `r` in the Vite terminal

You do **not** need `npm run android:offline` on every save while live reload is on.

#### When you are done coding

The Android project still points at your laptop until you sync without live mode. Switch back to a normal packaged app:

```powershell
Remove-Item Env:CAP_LIVE -ErrorAction SilentlyContinue
npm run android:offline
```

Then **Run** again from Android Studio.

#### Blank screen / phone cannot load the app

| Check | What to do |
| --- | --- |
| Vite is not running | Start `npm run dev:android` first and leave it open |
| IP changed | Run `$env:CAP_LIVE="1"; npx cap sync android` again, then Run in Android Studio |
| Firewall | Allow **Node.js** on private networks, or allow inbound TCP **5174** |
| Different Wi‑Fi | Phone and PC must be on the same LAN (or use USB + the steps below) |
| Emulator | Host IP is often `10.0.2.2`. If LAN IP fails, ask a teammate or set live URL to `http://10.0.2.2:5174` |
| USB only, no Wi‑Fi | With the phone plugged in: `adb reverse tcp:5174 tcp:5174`, sync with live URL `http://127.0.0.1:5174`, then Run |

To see your PC IPv4 on Windows:

```powershell
ipconfig
```

Use the **IPv4 Address** of Wi‑Fi or Ethernet (not `127.0.0.1`).

#### Optional: one command instead of Android Studio

If Capacitor can see the device (`adb devices`), you can install without clicking Run:

1. Terminal A: `npm run dev:android`
2. Edit `package.json` script `android:live` and set `--host` to **your** IPv4 (the value in the file may be an old IP)
3. Terminal B: `npm run android:live`

Android Studio is still the usual way to pick the device, read Logcat, and press Run.

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
| `npm.ps1 cannot be loaded` / running scripts is disabled | Use `npm.cmd run dev:android` (and `npx.cmd`), or run `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` once |
| Port 5174 is already in use | Vite is already running. Skip starting it again and go to `$env:CAP_LIVE="1"; npx.cmd cap sync android`. Or stop the old Vite terminal with Ctrl+C |
| Live Android app is blank | Keep `npm run dev:android` running, re-run `$env:CAP_LIVE="1"; npx cap sync android`, then Run in Android Studio |
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
