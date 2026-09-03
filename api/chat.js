// POST /api/chat — the only place the Gemini key ever exists.
//
// Web-standard handler: (Request) => Response. That signature runs unmodified
// on Vercel's Node runtime AND inside Bun's serve() router, so `bun dev`
// exercises the exact same code path as production.
//
// Pipeline (every gate returns early):
//   1 method  3 origin  4 per-IP rate  2 key  5 message  6 history
//   7 daily budget  8 [RAG — not yet]  9 LLM call + stream

import { SYSTEM_PROMPT } from './_knowledge.js';
import { env, json, guard, withinDailyBudget, contactEmail } from './_guard.js';
import { toVercel } from './_web.js';

export const config = { runtime: 'nodejs', maxDuration: 30 };

// Same Web handler for Bun dev and Vercel's (req, res) runtime — see _web.js.
export default toVercel(handler);

// ---------------------------------------------------------------- constants
const MAX_MESSAGE_CHARS = 600;
const MAX_HISTORY_TURNS = 8;    // turns actually sent upstream
const MAX_HISTORY_RAW = 40;     // hard cap BEFORE any work (CPU-DoS guard)
const MAX_HISTORY_TEXT = 1200;  // per-turn text cap
const MAX_OUTPUT_TOKENS = 400;
const RATE_LIMIT = 8;           // requests / minute / IP
const GLOBAL_PER_DAY = 500;     // total chats/day across ALL visitors
const UPSTREAM_TIMEOUT_MS = 20000;

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// In-character error copy — the visitor never sees a stack trace.
const MAIL = contactEmail();
const ERR = {
  method: 'Wrong door. This one only takes POST.',
  key: `My brain isn't wired up right now — email me at ${MAIL} and you'll get the real me.`,
  origin: 'This chat only runs on my own site.',
  rate: "Easy — you're asking faster than I can think. Give me a minute.",
  daily: `I've hit my daily chat budget. Email me at ${MAIL} — that reaches the actual me anyway.`,
  tooLong: "That's a lot at once. Keep it under 600 characters and I'll give you a proper answer.",
  empty: 'Ask me something and I will actually answer.',
  upstream: `My thinking stalled out. Try again, or email me at ${MAIL}.`,
  blocked: "I lost that thread — ask me again and I'll take another run at it.",
};

// -------------------------------------------------------------------- history
// Client-supplied context, never verified conversation. Bound the work first,
// then validate, then trim to what we actually send.
function sanitizeHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(-MAX_HISTORY_RAW)
    .filter((t) => t && (t.role === 'user' || t.role === 'model') && typeof t.text === 'string' && t.text.trim())
    .map((t) => ({ role: t.role, parts: [{ text: t.text.slice(0, MAX_HISTORY_TEXT) }] }))
    .slice(-MAX_HISTORY_TURNS);
}

// -------------------------------------------------------------- model fallback
// Free quotas are small and per-model. Each entry is a fresh pool.
function modelChain() {
  const first = env('GEMINI_MODEL');
  const chain = [first, 'gemini-3.5-flash-lite', 'gemini-3.5-flash'].filter(Boolean);
  return [...new Set(chain)];
}

// The lite models reject thinkingConfig outright (400), and don't think by
// default anyway. The full flash models DO think by default, which burns the
// output budget before a single visible token — so turn it off there.
const wantsThinkingOff = (model) => !/lite/i.test(model);

function buildBody(model, history, message, { thinking = true } = {}) {
  const generationConfig = {
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    temperature: 0.85,
    topP: 0.95,
  };
  if (thinking && wantsThinkingOff(model)) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }
  return JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [...history, { role: 'user', parts: [{ text: message }] }],
    generationConfig,
    safetySettings: [
      'HARM_CATEGORY_HARASSMENT',
      'HARM_CATEGORY_HATE_SPEECH',
      'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      'HARM_CATEGORY_DANGEROUS_CONTENT',
    ].map((category) => ({ category, threshold: 'BLOCK_ONLY_HIGH' })),
  });
}

// One model, with a single retry that drops thinkingConfig if the model turns
// out to reject it. Keeps us working when a model's parameter support changes.
async function tryModel(key, model, history, message, signal) {
  const attempts = wantsThinkingOff(model) ? [true, false] : [false];
  for (const thinking of attempts) {
    let res;
    try {
      res = await fetch(`${GEMINI_BASE}/${model}:streamGenerateContent?alt=sse`, {
        method: 'POST',
        headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
        body: buildBody(model, history, message, { thinking }),
        signal,
      });
    } catch (e) {
      if (e?.name === 'AbortError') throw e;
      return { status: 0 };
    }
    if (res.ok) return { res, status: 200 };
    // A 400 on the thinking attempt means this model won't take the parameter.
    if (res.status === 400 && thinking) { res.body?.cancel?.(); continue; }
    return { status: res.status };
  }
  return { status: 400 };
}

// Walks the chain until one model answers. Returns the live upstream response
// so headers/status are decided before we commit to streaming.
async function callUpstream(key, history, message, signal) {
  let lastStatus = 0;
  const attempts = [];
  for (const model of modelChain()) {
    const out = await tryModel(key, model, history, message, signal);
    attempts.push(`${model}:${out.status}`);
    if (out.res) return { ok: true, res: out.res, model };
    lastStatus = out.status;
    // 429 pool dry, 503 model swamped, 404 model retired — try the next one.
    // Anything else is our bug, so stop and report rather than burn the chain.
    if (![429, 503, 404].includes(out.status)) break;
  }
  // Server-side only. A bare 502 with no trace is undiagnosable in prod logs.
  console.error(`[chat] upstream exhausted: ${attempts.join(' -> ')}`);
  return { ok: false, status: lastStatus };
}

// ---------------------------------------------------------------------- handler
async function handler(request) {
  // 1, 3, 4 — method, origin allowlist, per-IP rate limit.
  // Origin matters because form-encoded POSTs skip CORS preflight, so CORS
  // alone does not stop another site from burning the quota. Checked before
  // the key so a disallowed origin learns nothing about our configuration.
  const blocked = await guard(request, {
    scope: 'chat',
    perMinute: RATE_LIMIT,
    errors: { method: ERR.method, origin: ERR.origin, rate: ERR.rate },
  });
  if (blocked) return blocked;

  // 2 — key
  const key = env('GEMINI_API_KEY');
  if (!key) return json(500, { error: ERR.key });

  // 5 — message
  let payload;
  try { payload = await request.json(); } catch { return json(400, { error: ERR.empty }); }
  const message = typeof payload?.message === 'string' ? payload.message.trim() : '';
  if (!message) return json(400, { error: ERR.empty });
  if (message.length > MAX_MESSAGE_CHARS) return json(400, { error: ERR.tooLong });

  // 6 — history
  const history = sanitizeHistory(payload?.history);

  // 7 — global daily budget. Counted AFTER validation so junk cannot drain it.
  if (!(await withinDailyBudget('chat', GLOBAL_PER_DAY))) {
    return json(429, { error: ERR.daily });
  }

  // 8 — RAG retrieval goes here. Must fail silently to '' when added.

  // 9 — call upstream, re-stream as plain text
  // Idle timeout, not a total-duration one: re-armed on every chunk. A model
  // that is slow to START gets cut at 20s, and so does one that stalls
  // mid-stream — but a long answer arriving steadily is never killed.
  const controller = new AbortController();
  let timer;
  const arm = () => { clearTimeout(timer); timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS); };
  const disarm = () => clearTimeout(timer);
  arm();

  let upstream;
  try {
    upstream = await callUpstream(key, history, message, controller.signal);
  } catch (e) {
    disarm();
    console.error(`[chat] upstream ${e?.name === 'AbortError' ? `timed out after ${UPSTREAM_TIMEOUT_MS}ms` : `threw: ${e?.message}`}`);
    return json(502, { error: ERR.upstream });
  }

  if (!upstream.ok) {
    disarm();
    return json(upstream.status === 429 ? 429 : 502, {
      error: upstream.status === 429 ? ERR.daily : ERR.upstream,
    });
  }

  const stream = new ReadableStream({
    async start(ctl) {
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      const reader = upstream.res.body.getReader();
      let buffer = '';
      let wrote = false;

      const push = (text) => {
        if (!text) return;
        wrote = true;
        ctl.enqueue(encoder.encode(text));
      };

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          arm(); // progress made — reset the idle clock
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const raw = line.slice(5).trim();
            if (!raw || raw === '[DONE]') continue;
            let evt;
            try { evt = JSON.parse(raw); } catch { continue; }
            for (const part of evt?.candidates?.[0]?.content?.parts ?? []) {
              if (typeof part?.text === 'string' && !part.thought) push(part.text);
            }
          }
        }
        // Safety-blocked or empty candidate: say something rather than nothing.
        if (!wrote) push(ERR.blocked);
      } catch {
        // Headers are long gone. Keep whatever the visitor already has.
        if (!wrote) push(ERR.upstream);
      } finally {
        disarm();
        try { reader.cancel(); } catch { /* already closed */ }
        ctl.close();
      }
    },
    cancel() {
      disarm();
      controller.abort();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
