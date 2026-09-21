import os from "node:os";
import type { CapacitorConfig } from "@capacitor/cli";

function isTunnelName(name: string): boolean {
  return /tun|tap|proton|nord|wireguard|vpn|virtual|vethernet|hyper-v|bluetooth|loopback/i.test(name);
}

function lanIPv4(): string {
  const override = process.env.CAP_LIVE_HOST?.trim();
  if (override) return override;

  const candidates: { name: string; address: string; wifi: boolean }[] = [];
  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    if (isTunnelName(name)) continue;
    for (const address of addresses ?? []) {
      const isV4 = address.family === "IPv4" || address.family === 4;
      if (!isV4 || address.internal) continue;
      candidates.push({
        name,
        address: address.address,
        wifi: /wi-?fi|wireless|wlan/i.test(name),
      });
    }
  }

  return candidates.find((row) => row.wifi)?.address
    ?? candidates[0]?.address
    ?? "192.168.254.128";
}

const liveReload = process.env.CAP_LIVE === "1";
const liveUrl = `http://${lanIPv4()}:5174`;
if (liveReload) {
  process.stderr.write(`[capacitor] live reload ${liveUrl}\n`);
}

const config: CapacitorConfig = {
  appId: "com.learnease.app",
  appName: "LearnEase",
  webDir: "dist",
  android: {
    allowMixedContent: true,
  },
  server: {
    androidScheme: "https",
  },
  ...(liveReload
    ? {
        server: {
          url: liveUrl,
          cleartext: true,
        },
      }
    : {}),
};

export default config;
