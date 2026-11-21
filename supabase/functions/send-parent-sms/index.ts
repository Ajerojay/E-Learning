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

function toIntl(local09: string) {
  return `+63${local09.slice(1)}`;
}

function json(ok: boolean, extra: Record<string, unknown> = {}) {
  return Response.json({ ok, ...extra }, { status: 200, headers: corsHeaders });
}

function parseTextbeeError(body: string) {
  try {
    const parsed = JSON.parse(body) as {
      error?: string;
      message?: string;
      data?: { message?: string };
    };
    return String(parsed.error || parsed.message || parsed.data?.message || body).trim();
  } catch {
    return body.trim();
  }
}

async function sendTextbee(apiKey: string, deviceId: string, recipients: string[], message: string) {
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
  };
  const payload = {
    recipients,
    message,
    ...(deviceId ? { deviceId } : {}),
  };

  const urls = [
    "https://api.textbee.dev/api/v1/gateway/send-sms",
    ...(deviceId
      ? [`https://api.textbee.dev/api/v1/gateway/devices/${encodeURIComponent(deviceId)}/send-sms`]
      : []),
  ];

  let last = { ok: false, status: 0, body: "" };
  for (const url of urls) {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
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
    const local = normalizePhMobile(String(payload.number || ""));
    const message = String(payload.message || "").trim();
    if (!local || !message) {
      return json(false, { error: "Number and message are required." });
    }

    const apiKey = (
      Deno.env.get("TEXTBEE_API_KEY") ||
      Deno.env.get("textbee") ||
      Deno.env.get("TEXTBEE") ||
      ""
    ).trim();
    if (!apiKey) {
      return json(false, { error: "unconfigured" });
    }

    const deviceId = (
      Deno.env.get("TEXTBEE_DEVICE_ID") ||
      Deno.env.get("TEXTBEE_DEVICE") ||
      ""
    ).trim();

    const result = await sendTextbee(apiKey, deviceId, [toIntl(local)], message);
    if (!result.ok) {
      return json(false, { error: parseTextbeeError(result.body) || `TextBee HTTP ${result.status}` });
    }
    return json(true, { result: result.body });
  } catch (error) {
    return json(false, { error: error instanceof Error ? error.message : "SMS failed." });
  }
});
