import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { z } from "zod";

const SecurityEventSchema = z.object({
  eventType: z.enum([
    "AUTH_LOGIN_SUCCESS",
    "AUTH_LOGIN_FAILURE",
    "AUTH_LOGOUT",
    "AUTH_SESSION_INVALID",
    "AUTHORIZATION_DENIAL",
    "RATE_LIMIT_TRIGGERED"
  ]),
  severity: z.enum(["INFO", "WARN", "ERROR", "CRITICAL"]),
  ipAddress: z.string().max(255).optional(),
  route: z.string().max(255).optional(),
  metadata: z.record(z.any()).optional().transform(val => {
    // Bound the metadata size roughly to 2KB
    if (val && JSON.stringify(val).length > 2048) {
      return { _truncated: true };
    }
    return val;
  }),
  requestId: z.string().max(36).optional(),
  userId: z.string().max(255).optional(),
  tenantId: z.string().max(255).optional()
});

export async function POST(req: NextRequest) {
  const internalSecret = req.headers.get("x-internal-secret");
  if (internalSecret !== process.env.INTERNAL_SECURITY_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const rawBody = await req.json();
    const requestIdHeader = req.headers.get("x-request-id");
    if (requestIdHeader && !rawBody.requestId) {
      rawBody.requestId = requestIdHeader;
    }

    const parsed = SecurityEventSchema.safeParse(rawBody);
    if (!parsed.success) {
      logger.warn({ error: parsed.error }, "Malformed security event payload rejected");
      return NextResponse.json({ error: "Bad Request" }, { status: 400 });
    }

    const body = parsed.data;

    // Log the event strictly
    logger.warn({
      event: body.eventType,
      severity: body.severity,
      ipAddress: body.ipAddress,
      route: body.route,
      requestId: body.requestId,
      userId: body.userId,
      tenantId: body.tenantId,
      metadata: body.metadata
    });

    // Attempt to persist if Prisma is available
    await prisma.securityEvent.create({
      data: {
        eventType: body.eventType,
        severity: body.severity,
        ipAddress: body.ipAddress,
        route: body.route,
        metadata: body.metadata ? (body.metadata as any) : undefined,
        requestId: body.requestId,
        userId: body.userId,
        tenantId: body.tenantId
      }
    });

    return NextResponse.json({ status: "ok" });
  } catch (error) {
    logger.error({ err: error }, "Failed to process security event");
    return NextResponse.json({ error: "Failed to log event" }, { status: 500 });
  }
}
