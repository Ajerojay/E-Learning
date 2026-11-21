import { createHash } from "node:crypto";
import type { Plugin } from "vite";

/** Browser offline shell; native Android already bundles these same assets. */
export function offlineBuildPlugin(): Plugin {
  return {
    name: "learnease-offline-shell",
    enforce: "post",
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter(name => name.startsWith("assets/") && /\.(js|css|png|jpe?g|svg|webp|woff2?|mp3)$/i.test(name));
      const version = createHash("sha256").update(files.sort().join("\n")).digest("hex").slice(0, 16);
      this.emitFile({ type: "asset", fileName: "sw.js", source: `
const CACHE_PREFIX = 'learnease-shell-v2-';
const CACHE = CACHE_PREFIX + '${version}';
const FILES = ${JSON.stringify(["/", ...files])};
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const upgradingLegacyWorker = self.registration.active &&
      !(await caches.keys()).some(key => key.startsWith(CACHE_PREFIX));
    const cache = await caches.open(CACHE);
    try {
      for (let i = 0; i < FILES.length; i += 8) {
        await Promise.all(FILES.slice(i, i + 8).map(file => cache.add(new Request(new URL(file, self.registration.scope), { cache: 'reload' }))));
      }
    } catch (error) { await caches.delete(CACHE); throw error; }
    if (upgradingLegacyWorker) await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('learnease-shell-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    // Auth callbacks and the teacher portal need the current hosted page.
    if (/^\\/(?:app\\/)?(?:email-verified|reset-password|teacher-login|teacher-dashboard)\\/?$/.test(url.pathname)) return;
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      // Cloudflare redirects /index.html. A cached redirected response cannot
      // satisfy a browser navigation whose redirect mode is manual.
      const shell = await cache.match(new URL('/', self.registration.scope));
      return shell || fetch(request);
    })());
  } else if (url.pathname.includes('/assets/')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      return (await cache.match(request)) || fetch(request);
    })());
  }
});
` });
    },
  };
}
