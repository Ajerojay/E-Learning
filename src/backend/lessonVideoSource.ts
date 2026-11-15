const youtubeHosts = new Set([
  "youtube.com", "www.youtube.com", "m.youtube.com",
  "youtubekids.com", "www.youtubekids.com",
  "youtube-nocookie.com", "www.youtube-nocookie.com",
]);

export function getLessonYouTubeEmbed(source: string): string | null {
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const [kind, idFromPath] = url.pathname.slice(1).split("/");
  const id = url.hostname === "youtu.be"
    ? kind
    : youtubeHosts.has(url.hostname)
      ? kind === "watch" ? url.searchParams.get("v") : ["embed", "shorts", "live"].includes(kind) ? idFromPath : null
      : null;
  return id && /^[A-Za-z0-9_-]{11}$/.test(id)
    ? `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0`
    : null;
}
