// Cloudflare Worker — HRMS (Kula Vriksha) AI proxy
// Holds ANTHROPIC_API_KEY as a Cloudflare Secret; the browser never sees it.

const ALLOWED_ORIGINS = [
  'https://group-hrms.web.app',
  'https://group-hrms.firebaseapp.com'  // backup Firebase domain
];

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    const cors = {
      'Access-Control-Allow-Origin': allow,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return new Response('POST only', { status: 405, headers: cors });
    if (!env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set on this Worker' }),
        { status: 500, headers: { ...cors, 'content-type': 'application/json' } });
    }
    try {
      const body = await request.json();
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: body.model || 'claude-sonnet-4-6',
          max_tokens: body.max_tokens || 1600,
          system: body.system || undefined,
          messages: body.messages || []
        })
      });
      const text = await resp.text();
      return new Response(text, {
        status: resp.status,
        headers: { ...cors, 'content-type': 'application/json' }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }),
        { status: 500, headers: { ...cors, 'content-type': 'application/json' } });
    }
  }
};
