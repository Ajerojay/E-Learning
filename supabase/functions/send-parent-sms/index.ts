const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizePhMobile(value: string) {
  const digits = String(value || "").replace(/\D/g, "");
  let local = digits;
  if (local.startsWith("63") && local.length === 12) local = `0${local.slice(2)}`;
  if (local.startsWith("9") && local.length === 10) local = `0${local}`;
  return /^09\d{9}$/.test(local) ? local : null;
}

function json(ok: boolean, extra: Record<string, unknown> = {}, status = 200) {
  return Response.json({ ok, ...extra }, { status, headers: corsHeaders });
}

async function sendSemaphore(apiKey: string, number: string, message: string, sender?: string) {
  const form = new URLSearchParams();
  form.set("apikey", apiKey);
  form.set("number", number);
  form.set("message", message);
  if (sender) form.set("sendername", sender);

  const attempts = [
    {
      url: "https://api.semaphore.co/api/v4/messages",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    },
    {
      url: "https://api.semaphore.co/api/v4/messages",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apikey: apiKey,
        number,
        message,
        ...(sender ? { sendername: sender } : {}),
      }),
    },
  ];

  let last = { ok: false, status: 0, body: "" };
  for (const attempt of attempts) {
    const response = await fetch(attempt.url, {
      method: "POST",
      headers: attempt.headers,
      body: attempt.body,
    });
    const body = await response.text();
    last = { ok: response.ok, status: response.status, body };
    if (response.ok) return last;
  }
  return last;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await request.json() as { number?: string; message?: string };
    const number = normalizePhMobile(String(payload.number || ""));
    const message = String(payload.message || "").trim();
    if (!number || !message) {
      return json(false, { error: "Number and message are required." });
    }

    const apiKey = (
      Deno.env.get("SEMAPHORE_API_KEY") ||
      Deno.env.get("semaphore") ||
      Deno.env.get("SEMAPHORE") ||
      ""
    ).trim();
    if (!apiKey) {
      return json(false, { error: "unconfigured" });
    }

    const sender = (Deno.env.get("SEMAPHORE_SENDER") || "").trim();
    let result = await sendSemaphore(apiKey, number, message, sender || undefined);
    if (!result.ok && sender) {
      result = await sendSemaphore(apiKey, number, message);
    }
    if (!result.ok) {
      return json(false, { error: result.body || `Semaphore HTTP ${result.status}` });
    }
    return json(true, { result: result.body });
  } catch (error) {
    return json(false, { error: error instanceof Error ? error.message : "SMS failed." });
  }
});
