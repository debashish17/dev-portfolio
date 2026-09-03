# Dibya Debashish Bhoi · Folio 2026

Constructivist portfolio. React 19 + Motion, bundled by Bun, deployed as a static
site on Vercel with one serverless function for the chat.

```bash
bun install
bun dev      # hot-reloading dev server (also serves /api/chat)
bun run build
```

---

## D.D.B — the resident AI

A first-person chatbot that answers as Dibya, streams its reply token by token,
and can drive the site (open a page, open a project, fire confetti).

### Layout

| File | Role |
| --- | --- |
| `api/_knowledge.js` | System prompt — persona, facts, accuracy rules, security rules. Server-only; the `_` prefix keeps Vercel from exposing it as an endpoint. |
| `api/chat.js` | The function. 9 gates, SSE→plain-text streaming, model fallback. **The only place the API key exists.** |
| `src/components/chat.jsx` | UI + streaming reader + control-token allowlist. |

The handler is a Web-standard `(Request) => Response`, so the same file runs
unmodified on Vercel *and* inside Bun's dev router — `bun dev` exercises the real
production code path.

### Environment variables

Set these in **Vercel → Settings → Environment Variables**, and in a local
`.env.local` for `bun dev` (git-ignored — never commit a key).

| Variable | Required | Used by | Purpose |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | **yes** | chat | Gemini key. Server-side only. Get one at <https://aistudio.google.com/apikey>. |
| `WEB3FORMS_ACCESS_KEY` | **yes** | contact | Web3Forms access key. Server-side only — see below. |
| `CONTACT_EMAIL` | no | both | Address shown to visitors when something fails. Defaults to `ddev54081@gmail.com`. |
| `GEMINI_MODEL` | no | chat | Prepended to the model fallback chain. |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | recommended | both | Durable rate limits across instances and cold starts. Without these, limits are in-memory and reset on every cold start. |

```bash
for e in production preview development; do
  vercel env add GEMINI_API_KEY $e
  vercel env add WEB3FORMS_ACCESS_KEY $e
done
vercel env pull .env.local   # sync Development values back down
```

Upstash: create a free Redis database at <https://console.upstash.com>, then copy
its **REST URL** and **REST token**. No SDK is installed — the code talks to the
REST API with plain `fetch`, and falls back to in-memory counters on any error.

---

## Contact form — `api/contact.js`

`POST /api/contact` proxies the Web3Forms submission.

The access key previously sat in `page-contact.jsx`, which meant it shipped in
the JS bundle — anyone could scrape it and post to the inbox forever, with no
origin check and no rate limit. It now lives only in the function's environment,
behind the same gates as the chat, plus:

| Control | Value |
| --- | --- |
| Per-IP rate | 3 submissions / minute |
| Global budget | 100 / day |
| Field caps | name 100, email 200, message 2000 |
| Honeypot | a hidden `botcheck` field; if filled, the request returns success and sends nothing |
| Upstream timeout | 12 s |

If you rotate the Web3Forms key, change it **only** in Vercel — nothing in
`src/` should ever contain it again.

### Abuse controls

| Gate | Limit |
| --- | --- |
| Message length | 600 chars |
| History sent upstream | 8 turns (hard-capped at 40 raw before any work) |
| Output tokens | 400 |
| Per-IP rate | 8 requests / minute |
| Global budget | 500 chats / day |
| Upstream timeout | 20 s |

Origin is allowlisted to `dibyadebashish.com`, `debashish17-dev-portfolio*.vercel.app`
and localhost. Never widen this to bare `vercel.app` — that admits anyone with a
free account.

### Model fallback

`GEMINI_MODEL` → `gemini-2.5-flash-lite` → `gemini-2.5-flash`. On 429 (quota dry)
or 404 (model retired) it falls to the next; each is a separate free-tier pool.
Any other status stops and reports.

### Control tokens

The model may append **one** token to a reply; the UI strips it from the bubble
and acts on it:

```
[[open:page:work]]  [[open:project:ttsched]]  [[open:link:github]]  [[do:confetti]]
```

The allowlist exists in two places on purpose — `api/_knowledge.js` §10 tells the
model what it may emit, and `resolveToken()` in `src/components/chat.jsx` decides
what the page will actually honour. Model output is untrusted; a token that is
not in the *frontend* list does nothing.

### Editing the persona

`api/_knowledge.js` is 80% of the quality. Two rules:

1. **Keep it consistent with the site.** Every fact there also appears in
   `src/pages/*.jsx`. Change one, grep the other.
2. **Section 7 (“The human side”) is still a placeholder.** Replace the
   `<<< FILL ME IN >>>` block with real detail — that section is what makes the
   chat memorable rather than merely accurate.
