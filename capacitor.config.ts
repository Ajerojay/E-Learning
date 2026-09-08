import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.learnease.app',
  appName: 'LearnEase',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
  },
};

export default config;
