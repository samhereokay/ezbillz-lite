import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  // Use internal secret instead of IP since IP is unreliable when proxying through Caddy in containers
  const internalSecret = req.headers.get("x-internal-secret");
  if (internalSecret !== (process.env.NEXTAUTH_SECRET || "fallback")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const requestId = req.headers.get("x-request-id") || body.requestId || null;

    // Log the event to standard stdout
    logger.warn({
      ...body,
      requestId,
      event: body.eventType,
    });

    // Attempt to persist if Prisma is available
    await prisma.securityEvent.create({
      data: {
        eventType: body.eventType,
        severity: body.severity,
        ipAddress: body.ipAddress,
        route: body.route,
        metadata: body.metadata,
        requestId,
      }
    });

    return NextResponse.json({ status: "ok" });
  } catch (error) {
    logger.error({ err: error }, "Failed to process security event");
    return NextResponse.json({ error: "Failed to log event" }, { status: 500 });
  }
}
