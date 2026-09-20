import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function isRateLimited(ip: string, limit = 15, windowMs = 60000) {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
    return { limited: false, count: 1, limit, windowMs };
  }
  record.count += 1;
  return { limited: record.count > limit, count: record.count, limit, windowMs };
}

export function proxy(req: NextRequest) {
  let requestId = req.headers.get("x-request-id");
  
  if (process.env.NODE_ENV === "production") {
    // In production, Caddy MUST be the one setting X-Request-ID.
    // If it's missing, it's either a misconfiguration or direct access (which shouldn't happen).
    if (!requestId || requestId.length > 36 || !/^[0-9a-fA-F-]+$/.test(requestId)) {
      requestId = crypto.randomUUID();
    }
  } else {
    // Fallback for development where Caddy might not be present
    if (!requestId || requestId.length > 36 || !/^[0-9a-fA-F-]+$/.test(requestId)) {
      requestId = crypto.randomUUID();
    }
  }

  const reqHeaders = new Headers(req.headers);
  reqHeaders.set("x-request-id", requestId);

  if (req.nextUrl.pathname.startsWith("/api/auth/")) {
    let ip = "127.0.0.1";
    let shouldRateLimit = false;

    if (process.env.NODE_ENV === "production") {
      ip = req.headers.get("x-real-ip") || "127.0.0.1";
      shouldRateLimit = true;
    } else {
      ip = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0] || "127.0.0.1";
      const isLocal = ip === "127.0.0.1" || ip === "::1" || ip.startsWith("172.") || ip.startsWith("192.168.") || ip.startsWith("10.");
      if (!isLocal && process.env.NODE_ENV !== "development") {
        shouldRateLimit = true;
      }
    }

    if (shouldRateLimit) {
      const rl = isRateLimited(ip, 15, 60000);
      if (rl.limited) {
        // Log event only on the exact transition into blocked state for this window.
        if (rl.count === rl.limit + 1) {
          // Fire-and-forget fetch to internal API to log the security event
          // since Prisma can't be used in Edge middleware.
          fetch("http://127.0.0.1:3000/api/internal/security-events", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-request-id": requestId,
              "x-internal-secret": process.env.NEXTAUTH_SECRET || "fallback"
            },
            body: JSON.stringify({
              eventType: "RATE_LIMIT_TRIGGERED",
              severity: "WARN",
              ipAddress: ip,
              route: req.nextUrl.pathname,
              metadata: {
                rateLimitKeyType: "ip",
                limit: rl.limit,
                windowSeconds: rl.windowMs / 1000
              }
            })
          }).catch(() => {});
        }
        return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "X-Request-ID": requestId } });
      }
    }
  }

  const res = NextResponse.next({
    request: {
      headers: reqHeaders,
    },
  });

  res.headers.set("X-Request-ID", requestId);

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
