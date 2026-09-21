import { serve } from "bun";
import index from "./index.html";
import chat from "../api/chat.js";
import contact from "../api/contact.js";
import studio from "../api/studio.js";
import posterPage from "../api/p.js";
import github from "../api/github.js";

const server = serve({
  port: Number(process.env.PORT) || 0, // PORT=3000 for a stable local URL, else the OS picks one
  routes: {
    // Resident AI. Same Web-standard handler Vercel runs in production,
    // so `bun dev` exercises the real code path (needs GEMINI_API_KEY in
    // .env.local, which Bun loads automatically).
    "/api/chat": (req) => chat(req),

    // Contact form proxy — keeps the Web3Forms key server-side.
    "/api/contact": (req) => contact(req),

    // Contribution calendar — GitHub GraphQL behind an Upstash cache.
    "/api/github": (req) => github(req),

    // The Studio: publish / like / wall. Same handler as production; the op
    // comes from the path (Vercel rewrites /api/studio/<op> → ?op=<op>).
    "/api/studio": (req) => studio(req),
    "/api/studio/:op": (req) => studio(req),

    // Poster share pages — OG tags for crawlers, redirect for humans.
    "/p/:id": (req) => posterPage(req),

    // Serve static uploads
    "/uploads/:file": async (req) => {
      const file = req.params.file;
      return new Response(Bun.file(`uploads/${file}`));
    },

    // Hero assets — the frame sequence and the art plate. In production these
    // are copied into dist/ by build.ts and served straight off the CDN; in dev
    // they come from public/. Without these two routes the SPA catch-all below
    // answers every one of them with index.html.
    "/hero/frames/:file": async (req) => {
      const file = req.params.file;
      if (!/^f_\d{4}\.webp$/.test(file)) return new Response("no", { status: 404 });
      return new Response(Bun.file(`public/hero/frames/${file}`), {
        headers: { "Cache-Control": "public, max-age=3600" },
      });
    },
    "/hero/:file": async (req) => {
      const file = req.params.file;
      if (!/^[a-z0-9_-]+\.(webp|png|jpg|svg)$/i.test(file)) return new Response("no", { status: 404 });
      return new Response(Bun.file(`public/hero/${file}`), {
        headers: { "Cache-Control": "public, max-age=3600" },
      });
    },

    // Serve index.html for all unmatched routes.
    "/*": index,

    "/api/hello": {
      async GET(req) {
        return Response.json({
          message: "Hello, world!",
          method: "GET",
        });
      },
      async PUT(req) {
        return Response.json({
          message: "Hello, world!",
          method: "PUT",
        });
      },
    },

    "/api/hello/:name": async req => {
      const name = req.params.name;
      return Response.json({
        message: `Hello, ${name}!`,
      });
    },
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
