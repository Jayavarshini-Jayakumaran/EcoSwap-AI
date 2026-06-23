// Gemini proxy for EcoSwap AI.
// Keeps the Gemini key on the server side and rate-limits requests
// per visitor so one person can't burn through the whole quota.

const MAX_PER_MINUTE = 5;
const MAX_PER_DAY = 60; // each "analysis" in the app makes 2 calls, so this is ~30 scans/day per IP

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // rate limit per IP, tracked in KV
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const now = new Date();
    const minuteKey = `rl:min:${ip}:${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}-${now.getUTCMinutes()}`;
    const dayKey = `rl:day:${ip}:${now.toISOString().slice(0, 10)}`;

    const [minuteCountRaw, dayCountRaw] = await Promise.all([
      env.RATE_LIMIT_KV.get(minuteKey),
      env.RATE_LIMIT_KV.get(dayKey),
    ]);
    const minuteCount = parseInt(minuteCountRaw || '0', 10);
    const dayCount = parseInt(dayCountRaw || '0', 10);

    if (minuteCount >= MAX_PER_MINUTE) {
      return rateLimitResponse(corsHeaders, 'Too many requests, wait a minute and try again.');
    }
    if (dayCount >= MAX_PER_DAY) {
      return rateLimitResponse(corsHeaders, 'Daily limit reached for this connection, try again tomorrow.');
    }

    await Promise.all([
      env.RATE_LIMIT_KV.put(minuteKey, String(minuteCount + 1), { expirationTtl: 60 }),
      env.RATE_LIMIT_KV.put(dayKey, String(dayCount + 1), { expirationTtl: 86400 }),
    ]);

    // forward to Gemini with the real key attached here, not in the browser
    let body;
    try {
      body = await request.text();
    } catch {
      return new Response(JSON.stringify({ error: 'bad_request' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const geminiResp = await fetch(`${GEMINI_URL}?key=${env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    const respBody = await geminiResp.text();

    return new Response(respBody, {
      status: geminiResp.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  },
};

function rateLimitResponse(corsHeaders, message) {
  return new Response(JSON.stringify({ error: { message: `RESOURCE_EXHAUSTED: ${message}` } }), {
    status: 429,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
