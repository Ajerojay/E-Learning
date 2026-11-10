import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = 5174;
const liveHost = "127.0.0.1";
const liveUrl = `http://${liveHost}:${port}`;
const isWin = process.platform === "win32";
const npmCmd = isWin ? "npm.cmd" : "npm";
const npxCmd = isWin ? "npx.cmd" : "npx";

function sdkDir() {
  const local = path.join(root, "android", "local.properties");
  if (existsSync(local)) {
    const match = readFileSync(local, "utf8").match(/sdk\.dir=(.*)/);
    if (match?.[1]) return match[1].trim().replaceAll("\\\\", "\\").replaceAll("\\:", ":");
  }
  return process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || "";
}

function adbBin() {
  const sdk = sdkDir();
  const fromSdk = sdk ? path.join(sdk, "platform-tools", isWin ? "adb.exe" : "adb") : "";
  if (fromSdk && existsSync(fromSdk)) return fromSdk;
  return isWin ? "adb.exe" : "adb";
}

function run(bin, args, extraEnv = {}) {
  const result = spawnSync(bin, args, {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    encoding: "utf8",
    shell: isWin && !bin.endsWith(".exe") && !path.isAbsolute(bin),
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function portOpen() {
  return new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1", () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
  });
}

function deviceIds() {
  const listed = run(adbBin(), ["devices"]);
  return listed.stdout
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.endsWith("\tdevice"))
    .map((line) => line.split("\t")[0]);
}

function applyReverse() {
  const devices = deviceIds();
  if (!devices.length) return [];
  for (const id of devices) {
    run(adbBin(), ["-s", id, "reverse", `tcp:${port}`, `tcp:${port}`]);
  }
  return devices;
}

function capacitorPointsAtUsbLive() {
  const configPath = path.join(root, "android", "app", "src", "main", "assets", "capacitor.config.json");
  if (!existsSync(configPath)) return false;
  try {
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    return config?.server?.url === liveUrl;
  } catch {
    return false;
  }
}

function startVite() {
  const child = spawn(npmCmd, ["run", "dev:android"], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    shell: isWin,
  });
  child.on("exit", (code) => {
    if (code) process.exit(code);
  });
}

async function waitForVite() {
  for (let i = 0; i < 40; i += 1) {
    if (await portOpen()) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

if (!(await portOpen())) {
  console.log(`[android-usb] starting Vite on ${liveUrl}`);
  startVite();
  if (!(await waitForVite())) {
    console.error("[android-usb] Vite did not start on port 5174.");
    process.exit(1);
  }
} else {
  console.log(`[android-usb] Vite already running at ${liveUrl}`);
}

let devices = applyReverse();
if (!devices.length) {
  console.log("[android-usb] Plug in the phone with USB debugging, then this script will attach.");
} else {
  console.log(`[android-usb] USB reverse ready on ${devices.join(", ")} → ${liveUrl}`);
}

if (!capacitorPointsAtUsbLive()) {
  console.log("[android-usb] Pointing the packaged app at USB live reload (one-time sync).");
  const sync = run(npxCmd, ["cap", "sync", "android"], {
    CAP_LIVE: "1",
    CAP_LIVE_HOST: liveHost,
    CAP_PACKAGED: "",
  });
  if (sync.status !== 0) {
    process.stderr.write(sync.stderr);
    process.exit(sync.status);
  }
  console.log("[android-usb] Press Run once in Android Studio so the phone picks up this live URL.");
} else {
  console.log("[android-usb] Packaged app already loads live changes over USB.");
}

console.log(`[android-usb] Keep this window open. Save a file in Cursor — the phone refreshes while USB is connected.`);
console.log(`[android-usb] For a true offline APK, use: npm run android:offline`);

setInterval(() => {
  const next = applyReverse();
  if (next.join(",") !== devices.join(",")) {
    devices = next;
    if (devices.length) {
      console.log(`[android-usb] USB reverse restored on ${devices.join(", ")}`);
    } else {
      console.log("[android-usb] Phone disconnected. Replug USB to keep live reload.");
    }
  }
}, 4000);

try {
  os.setPriority(process.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
} catch {
  /* optional */
}
