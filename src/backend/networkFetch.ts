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
  const timeout = setTimeout(() => controller.abort(new DOMException("Connection timed out", "TimeoutError")), 6000);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    upstream?.removeEventListener("abort", abort);
  }
}
