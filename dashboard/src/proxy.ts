import { NextResponse, type NextRequest } from "next/server";

// One public domain (inventaapi.shop) serves everything through this Customer app:
//   /admin, /admin/*  -> the Admin app (built with basePath "/admin"), ADMIN_ORIGIN
//   /api/*, /daas/*   -> the API, API_ORIGIN
// The API rate-limits per caller IP. Behind this hop it would only see Vercel's
// address, so the caller's IP travels in x-inventa-client-ip together with the shared
// secret INVENTA_PROXY_SECRET (checked in services/rate-limit-client-ip.js).
// Without ADMIN_ORIGIN / API_ORIGIN (local development) the next.config rewrites apply.
export const ADMIN_BASE_PATH = "/admin";

function callerIp(request: NextRequest): string | null {
  // On Vercel this header holds the connecting client's IP (set by the platform).
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || null;
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === ADMIN_BASE_PATH || pathname.startsWith(`${ADMIN_BASE_PATH}/`)) {
    const adminOrigin = process.env.ADMIN_ORIGIN;
    if (!adminOrigin) return NextResponse.next();
    return NextResponse.rewrite(new URL(pathname + search, adminOrigin));
  }

  const apiOrigin = process.env.API_ORIGIN;
  if (!apiOrigin) return NextResponse.next();
  const headers = new Headers(request.headers);
  // Never pass through values a caller may have set themselves.
  headers.delete("x-inventa-client-ip");
  headers.delete("x-inventa-proxy-key");
  const ip = callerIp(request);
  const secret = process.env.INVENTA_PROXY_SECRET;
  if (ip && secret) {
    headers.set("x-inventa-client-ip", ip);
    headers.set("x-inventa-proxy-key", secret);
  }
  return NextResponse.rewrite(new URL(pathname + search, apiOrigin), { request: { headers } });
}

export const config = {
  matcher: ["/api/:path*", "/daas/:path*", "/admin", "/admin/:path*"],
};
