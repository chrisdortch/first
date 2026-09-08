import { NextResponse, type NextRequest } from "next/server";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function middleware(request: NextRequest) {
  if (MUTATING_METHODS.has(request.method)) {
    const origin = request.headers.get("origin");
    if (!origin || origin !== request.nextUrl.origin) {
      return Response.json({ error: "Request denied" }, {
        status: 403,
        headers: { "Cache-Control": "no-store" }
      });
    }
  }

  const response = NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/sessions")) {
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Vary", "Cookie, Authorization");
  }
  return response;
}

export const config = { matcher: ["/api/sessions/:path*"] };
