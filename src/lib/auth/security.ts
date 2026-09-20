import type { NextRequest } from "next/server";

export async function logInternalSecurityEvent(
  eventType: string,
  severity: string,
  req: NextRequest | Request | null,
  metadata?: any,
  tenantId?: string,
  userId?: string
) {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-internal-secret": process.env.INTERNAL_SECURITY_SECRET || "",
    };

    let ipAddress = "127.0.0.1";
    let route = "";

    if (req) {
      const reqId = req.headers.get("x-request-id");
      if (reqId) headers["x-request-id"] = reqId;
      
      ipAddress = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0] || "127.0.0.1";
      if ('nextUrl' in req) {
        route = (req as NextRequest).nextUrl.pathname;
      } else {
        route = new URL(req.url).pathname;
      }
    }

    // Fire-and-forget fetch to internal API
    fetch("http://127.0.0.1:3000/api/internal/security-events", {
      method: "POST",
      headers,
      body: JSON.stringify({
        eventType,
        severity,
        ipAddress,
        route,
        metadata,
        userId,
        tenantId,
      })
    }).catch(() => {});
  } catch (err) {
    // Intentionally ignore failure to prevent application failure on logging error
  }
}
