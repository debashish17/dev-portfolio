// POST /api/contact — server-side proxy for the Web3Forms submission.
//
// The access key used to sit in page-contact.jsx, which meant it shipped in
// the JS bundle: anyone could scrape it and post to your inbox forever, with
// no origin check and no rate limit. Now the key lives only here, behind the
// same gates as /api/chat.

import { env, json, guard, withinDailyBudget, contactEmail } from './_guard.js';
import { toVercel } from './_web.js';

export const config = { runtime: 'nodejs', maxDuration: 15 };

// Same Web handler for Bun dev and Vercel's (req, res) runtime — see _web.js.
export default toVercel(handler);

const MAX_NAME = 100;
const MAX_EMAIL = 200;
const MAX_MESSAGE = 2000;
const RATE_LIMIT = 3;        // submissions / minute / IP — a human sends one
const GLOBAL_PER_DAY = 100;  // ceiling on inbox flooding
const UPSTREAM_TIMEOUT_MS = 12000;

const WEB3FORMS = 'https://api.web3forms.com/submit';
const MAIL = contactEmail();

const ERR = {
  method: 'Wrong door. This one only takes POST.',
  origin: 'This form only runs on my own site.',
  rate: 'Easy — that is a lot of messages at once. Give it a minute.',
  daily: `The form has hit its daily limit. Email me directly at ${MAIL}.`,
  config: `The form is not wired up right now — email me directly at ${MAIL}.`,
  invalid: 'Please fill in your name, a valid email, and a message.',
  tooLong: 'That message is longer than the form accepts — trim it a little.',
  upstream: `That did not send. Try again, or email me directly at ${MAIL}.`,
};

// Deliberately permissive: rejecting odd-but-valid addresses loses real
// messages, and Web3Forms verifies deliverability downstream anyway.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const str = (v) => (typeof v === 'string' ? v.trim() : '');

async function handler(request) {
  const blocked = await guard(request, {
    scope: 'contact',
    perMinute: RATE_LIMIT,
    errors: { method: ERR.method, origin: ERR.origin, rate: ERR.rate },
  });
  if (blocked) return blocked;

  const key = env('WEB3FORMS_ACCESS_KEY');
  if (!key) return json(500, { error: ERR.config });

  let payload;
  try { payload = await request.json(); } catch { return json(400, { error: ERR.invalid }); }

  // Honeypot: a real person never fills this. Report success so the bot has
  // nothing to learn and moves on.
  if (str(payload?.botcheck)) return json(200, { success: true });

  const name = str(payload?.name);
  const email = str(payload?.email);
  const message = str(payload?.message);

  if (!name || !email || !message || !EMAIL_RE.test(email)) {
    return json(400, { error: ERR.invalid });
  }
  if (name.length > MAX_NAME || email.length > MAX_EMAIL || message.length > MAX_MESSAGE) {
    return json(400, { error: ERR.tooLong });
  }

  // Counted only once the submission is real, so junk cannot drain the day.
  if (!(await withinDailyBudget('contact', GLOBAL_PER_DAY))) {
    return json(429, { error: ERR.daily });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const res = await fetch(WEB3FORMS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        access_key: key,
        name,
        email,
        message,
        replyto: email,
        from_name: 'Portfolio · dibyadebashish.com',
        subject: `Portfolio message from ${name}`,
      }),
      signal: controller.signal,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      console.error(`[contact] web3forms ${res.status}: ${data?.message || 'no body'}`);
      return json(502, { error: ERR.upstream });
    }
    return json(200, { success: true });
  } catch (e) {
    console.error(`[contact] ${e?.name === 'AbortError' ? `timed out after ${UPSTREAM_TIMEOUT_MS}ms` : `threw: ${e?.message}`}`);
    return json(502, { error: ERR.upstream });
  } finally {
    clearTimeout(timer);
  }
}
