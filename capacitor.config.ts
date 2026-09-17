import os from "node:os";
import type { CapacitorConfig } from "@capacitor/cli";

function lanIPv4(): string {
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      const isV4 = address.family === "IPv4" || address.family === 4;
      if (isV4 && !address.internal) return address.address;
    }
  }
  return "192.168.254.128";
}

const liveReload = process.env.CAP_LIVE === "1";
const liveUrl = `http://${lanIPv4()}:5174`;

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
