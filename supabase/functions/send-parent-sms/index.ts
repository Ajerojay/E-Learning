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

    const apiKey = Deno.env.get("SEMAPHORE_API_KEY") || "";
    if (!apiKey) {
      return Response.json({ ok: false, error: "unconfigured" }, { status: 501, headers: corsHeaders });
    }

    const response = await fetch("https://api.semaphore.co/api/v4/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apikey: apiKey,
        number,
        message,
        sendername: Deno.env.get("SEMAPHORE_SENDER") || "SEMAPHORE",
      }),
    });
    const body = await response.text();
    if (!response.ok) {
      return Response.json({ ok: false, error: body }, { status: 502, headers: corsHeaders });
    }
    return Response.json({ ok: true, result: body }, { headers: corsHeaders });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "SMS failed." },
      { status: 500, headers: corsHeaders },
    );
  }
});
