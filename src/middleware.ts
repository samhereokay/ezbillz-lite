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
    // X-Real-IP is safely set by our Nginx proxy to the actual $remote_addr.
    // We do not trust X-Forwarded-For for bypasses since it can be spoofed.
    const ip = req.headers.get("x-real-ip") || req.ip || "127.0.0.1";
    const isLocal = ip === "127.0.0.1" || ip === "::1" || ip.startsWith("172.") || ip.startsWith("192.168.") || ip.startsWith("10.");
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
