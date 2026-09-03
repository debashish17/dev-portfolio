import { serve } from "bun";
import index from "./index.html";
import chat from "../api/chat.js";
import contact from "../api/contact.js";

const server = serve({
  port: 0, // OS will automatically pick an available port
  routes: {
    // Resident AI. Same Web-standard handler Vercel runs in production,
    // so `bun dev` exercises the real code path (needs GEMINI_API_KEY in
    // .env.local, which Bun loads automatically).
    "/api/chat": (req) => chat(req),

    // Contact form proxy — keeps the Web3Forms key server-side.
    "/api/contact": (req) => contact(req),

    // Serve static uploads
    "/uploads/:file": async (req) => {
      const file = req.params.file;
      return new Response(Bun.file(`uploads/${file}`));
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
