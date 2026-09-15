const VIDEO_CACHE_NAME = "learnease-lesson-videos-v1";

async function openVideoCache(): Promise<Cache | null> {
  if (!("caches" in window)) return null;
  return caches.open(VIDEO_CACHE_NAME);
}

export async function getCachedVideoUrl(videoUrl: string): Promise<string | null> {
  const cache = await openVideoCache();
  if (!cache) return null;

  const response = await cache.match(videoUrl);
  if (!response) return null;

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export async function cacheVideo(videoUrl: string): Promise<string> {
  const cache = await openVideoCache();
  if (!cache) {
    throw new Error("Offline video storage is not available on this device.");
  }

  const response = await fetch(videoUrl, { mode: "cors" });
  if (!response.ok) {
    throw new Error(`Video download failed (${response.status}).`);
  }

  await cache.put(videoUrl, response.clone());
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export async function hasCachedVideo(videoUrl: string): Promise<boolean> {
  const cache = await openVideoCache();
  if (!cache) return false;
  return Boolean(await cache.match(videoUrl));
}
