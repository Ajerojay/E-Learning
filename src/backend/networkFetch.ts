/** Bound database calls even when Wi-Fi is connected but the internet is gone. */
export async function networkFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new TypeError("Offline: use saved device data");
  }
  const controller = new AbortController();
  const upstream = init?.signal ?? (typeof Request !== "undefined" && input instanceof Request ? input.signal : undefined);
  const abort = () => controller.abort(upstream?.reason);
  if (upstream?.aborted) abort();
  else upstream?.addEventListener("abort", abort, { once: true });
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "https://localhost");
  const method = init?.method ?? (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET");
  const lessonUpload = method.toUpperCase() === "POST"
    && url.pathname.startsWith("/storage/v1/object/lesson-videos/");
  // Video uploads send the whole file. Password recovery waits for the mail provider.
  const timeoutMs = lessonUpload ? 600000 : url.pathname === "/auth/v1/recover" ? 60000 : 6000;
  const timeout = setTimeout(() => controller.abort(new DOMException("Connection timed out", "TimeoutError")), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    upstream?.removeEventListener("abort", abort);
  }
}
