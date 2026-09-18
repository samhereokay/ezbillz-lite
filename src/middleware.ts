import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function isRateLimited(ip: string, limit = 15, windowMs = 60000): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
    return false;
  }
  record.count += 1;
  return record.count > limit;
}

export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api/auth/")) {
    // In production without a trusted proxy, Next.js standalone middleware does not expose the true socket IP.
    // Client-supplied headers like X-Forwarded-For cannot be trusted for identity as they can be rotated to bypass limits.
    // We fall back to a global rate limit token to safely fail-closed against brute-force attacks.
    const ip = process.env.NODE_ENV === "production"
      ? "global_auth_limit"
      : (req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0] || "127.0.0.1");

    const isLocal = ip === "127.0.0.1" || ip === "::1" || ip.startsWith("172.") || ip.startsWith("192.168.") || ip.startsWith("10.");

    // In production, isLocal will evaluate to false for "global_auth_limit", ensuring no IP can bypass the limit.
    // Skip rate limiting for local tests
    if (!isLocal && process.env.NODE_ENV !== "development") {
      if (isRateLimited(ip, 15, 60000)) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 });
      }
    }
  }

  const res = NextResponse.next();

  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (process.env.NODE_ENV === "production") {
    res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  }

  return res;
}

export const config = {
  matcher: "/:path*",
};
