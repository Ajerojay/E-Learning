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

async function sendSemaphore(apiKey: string, number: string, message: string, sender?: string) {
  const params = new URLSearchParams();
  params.set("apikey", apiKey);
  params.set("number", number);
  params.set("message", message);
  if (sender) params.set("sendername", sender);

  const response = await fetch("https://api.semaphore.co/api/v4/messages", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const body = await response.text();
  return { ok: response.ok, status: response.status, body };
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
      return Response.json({ ok: false, error: "Number and message are required." }, { status: 400, headers: corsHeaders });
    }

    const apiKey =
      Deno.env.get("SEMAPHORE_API_KEY") ||
      Deno.env.get("semaphore") ||
      Deno.env.get("SEMAPHORE") ||
      "";
    if (!apiKey) {
      return Response.json({ ok: false, error: "unconfigured" }, { status: 501, headers: corsHeaders });
    }

    const sender = (Deno.env.get("SEMAPHORE_SENDER") || "").trim();
    let result = await sendSemaphore(apiKey, number, message, sender || undefined);
    if (!result.ok && sender) {
      result = await sendSemaphore(apiKey, number, message);
    }
    if (!result.ok) {
      return Response.json({ ok: false, error: result.body || `HTTP ${result.status}` }, { status: 502, headers: corsHeaders });
    }
    return Response.json({ ok: true, result: result.body }, { headers: corsHeaders });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "SMS failed." },
      { status: 500, headers: corsHeaders },
    );
  }
});
