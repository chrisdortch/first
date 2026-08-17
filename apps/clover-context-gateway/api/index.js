import { handler as cloverHandler } from "../server.js";

const FAVICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Clover">
  <rect width="64" height="64" rx="14" fill="#06120d"/>
  <g fill="#88efb4">
    <circle cx="23" cy="23" r="12"/>
    <circle cx="41" cy="23" r="12"/>
    <circle cx="23" cy="41" r="12"/>
    <circle cx="41" cy="41" r="12"/>
  </g>
  <path d="M32 33c1 11 3 18 9 24" fill="none" stroke="#88efb4" stroke-width="5" stroke-linecap="round"/>
</svg>`.trim();

function pathname(req) {
  return new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname;
}

export default function handler(req, res) {
  const path = pathname(req);

  if (req.method === "GET" && ["/favicon.ico", "/favicon.svg"].includes(path)) {
    res.writeHead(200, {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=86400, immutable",
      "x-content-type-options": "nosniff",
    });
    return res.end(FAVICON_SVG);
  }

  if (req.method === "GET" && path === "/robots.txt") {
    res.writeHead(200, {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
      "x-content-type-options": "nosniff",
    });
    return res.end("User-agent: *\nDisallow: /\n");
  }

  return cloverHandler(req, res);
}
