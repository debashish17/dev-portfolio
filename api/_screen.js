// SERVER-SIDE ONLY. The content screen for the Studio wall.
//
// Gemini vision looks at the visitor's ORIGINAL photo(s) (512 px, sent only for
// this check, never stored) and at the FINISHED poster render — the render is
// what catches a pen-drawn abuse. Explicit sexual content is refused; graphic
// gore too unless STUDIO_ALLOW_GORE=1. Everything else passes, faces included.
//
// Fails closed: quota, timeout, or a broken response → 'held', never 'pass'.
// Verdicts are cached by content hash so a remix of the same photo is free.
import { createHash } from 'node:crypto';
import { env } from './_guard.js';
import { redisConfigured, r1 } from './_redis.js';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 9000;          // per model
const DEADLINE_MS = 20000;        // across the whole fallback chain — the function has 30 s
const CACHE_TTL = 60 * 60 * 24 * 30;

const PROMPT = `You are the content screen for a public art wall on a personal portfolio website. Visitors upload a photo, which is posterised into four flat inks, and compose a poster with shapes.
Look at every image and classify the MOST severe content present.
- sexual: "none" | "suggestive" (swimwear, lingerie, mild sensuality — allowed) | "explicit" (exposed genitals, exposed female breasts, exposed buttocks, sexual acts, pornographic or fetish content — refused). Drawn or abstract shapes that clearly depict genitals count as explicit.
- gore: "none" | "mild" (a scrape, stage blood, fake horror) | "graphic" (real mutilation, severe wounds, dead bodies, animal cruelty).
Faces, portraits, selfies, children in ordinary settings, tattoos, weapons held normally, political symbols and ordinary text are all allowed — classify them "none".
Return ONLY JSON: {"sexual": "...", "gore": "...", "reason": "<at most 8 words>"}`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    sexual: { type: 'STRING', enum: ['none', 'suggestive', 'explicit'] },
    gore: { type: 'STRING', enum: ['none', 'mild', 'graphic'] },
    reason: { type: 'STRING' },
  },
  required: ['sexual', 'gore'],
};

function models() {
  const first = env('STUDIO_SCREEN_MODEL');
  // Flash-Lite pools are the roomiest on the free tier; keep the chat's first
  // choice LAST so a busy chat day never blocks publishing.
  return [...new Set([first, 'gemini-2.5-flash-lite', 'gemini-3.5-flash-lite', 'gemini-2.5-flash', 'gemini-3.5-flash'].filter(Boolean))];
}

const hashOf = (images) => createHash('sha256').update(images.map((i) => i.base64).join('|')).digest('hex').slice(0, 40);

async function callModel(model, key, images) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const generationConfig = { temperature: 0, maxOutputTokens: 120, responseMimeType: 'application/json', responseSchema: SCHEMA };
    if (!/lite/i.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };
    const res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: PROMPT }, ...images.map((i) => ({ inline_data: { mime_type: i.mime, data: i.base64 } }))] }],
        generationConfig,
        // Let the model SEE explicit content so it can label it; the label is
        // the verdict. A hard block is treated as a refusal too, below.
        safetySettings: ['HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_DANGEROUS_CONTENT']
          .map((category) => ({ category, threshold: 'BLOCK_ONLY_HIGH' })),
      }),
    });
    if (res.status === 429) return { retry: true, why: 'quota' };
    if (res.status === 404 || res.status === 400) return { retry: true, why: `model ${res.status}` };
    if (!res.ok) return { retry: true, why: `upstream ${res.status}` };
    const data = await res.json();
    if (data?.promptFeedback?.blockReason) return { verdict: 'reject', reason: `blocked: ${data.promptFeedback.blockReason}` };
    const cand = data?.candidates?.[0];
    if (!cand) return { retry: true, why: 'no candidate' };
    if (cand.finishReason === 'SAFETY' || cand.finishReason === 'PROHIBITED_CONTENT') return { verdict: 'reject', reason: `blocked: ${cand.finishReason}` };
    const text = (cand.content?.parts || []).map((p) => p.text || '').join('').trim();
    let parsed;
    try { parsed = JSON.parse(text.replace(/^```(?:json)?|```$/g, '').trim()); } catch { return { retry: true, why: 'unparsable' }; }
    const allowGore = env('STUDIO_ALLOW_GORE') === '1';
    if (parsed.sexual === 'explicit') return { verdict: 'reject', reason: parsed.reason || 'explicit sexual content' };
    if (parsed.gore === 'graphic' && !allowGore) return { verdict: 'reject', reason: parsed.reason || 'graphic gore' };
    if (!['none', 'suggestive', 'explicit'].includes(parsed.sexual)) return { retry: true, why: 'bad label' };
    return { verdict: 'pass', reason: parsed.reason || '' };
  } catch (e) {
    return { retry: true, why: e?.name === 'AbortError' ? 'timeout' : (e?.message || 'threw') };
  } finally { clearTimeout(timer); }
}

// images: [{ mime, base64 }]. Returns { verdict: 'pass'|'reject'|'held', reason, model, cached }.
export async function screenImages(images) {
  const key = env('GEMINI_API_KEY');
  if (!key || !images.length) return { verdict: 'held', reason: 'screen not configured' };
  const h = hashOf(images);
  const cacheKey = `studio:screen:${h}`;
  if (redisConfigured()) {
    try { const c = await r1('GET', cacheKey); if (c) { const v = JSON.parse(c); return { ...v, cached: true }; } } catch { /* cache miss */ }
  }
  const tried = [];
  const started = Date.now();
  for (const model of models()) {
    if (Date.now() - started > DEADLINE_MS - 4000) { tried.push(`${model}:skipped (deadline)`); continue; }
    const r = await callModel(model, key, images);
    if (r.retry) { tried.push(`${model}:${r.why}`); continue; }
    const out = { verdict: r.verdict, reason: r.reason, model };
    if (redisConfigured()) { try { await r1('SET', cacheKey, JSON.stringify(out), 'EX', String(CACHE_TTL)); } catch { /* fine */ } }
    return out;
  }
  console.error('[screen] held —', tried.join(' · '));
  return { verdict: 'held', reason: 'screen unavailable', tried };
}
