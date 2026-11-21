import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";
const npmCmd = isWin ? "npm.cmd" : "npm";
const npxCmd = isWin ? "npx.cmd" : "npx";

function run(bin, args) {
  const result = spawnSync(bin, args, {
    cwd: root,
    env: { ...process.env, CAP_PACKAGED: "1", CAP_LIVE: "", CAP_LIVE_HOST: "" },
    stdio: "inherit",
    shell: isWin,
  });
  if (result.status) process.exit(result.status);
}

run(npmCmd, ["run", "build"]);
run(npxCmd, ["cap", "sync", "android"]);
const indexHtml = path.join(root, "android", "app", "src", "main", "assets", "public", "index.html");
if (!existsSync(indexHtml)) {
  console.error("[android-offline] Missing android/app/src/main/assets/public/index.html after sync.");
  process.exit(1);
}
console.log("[android-offline] Packaged assets synced. Press Run in Android Studio to install.");
