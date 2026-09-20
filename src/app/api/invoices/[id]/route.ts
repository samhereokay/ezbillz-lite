import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireOrgContext, UnauthorizedError, ForbiddenError } from "@/server/tenant";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const ctx = await requireOrgContext();
    const invoice = await prisma.invoice.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      include: {
        customer: { select: { name: true, gstin: true, phone: true, email: true, state: true, city: true } },
        items: true,
        payments: { orderBy: { paidAt: "desc" } },
      },
    });
    if (!invoice) {
      await import("@/lib/auth/security").then(m => m.logInternalSecurityEvent("AUTHORIZATION_DENIAL", "WARN", req, { resource: "invoice", id: params.id }));
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ invoice });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      await import("@/lib/auth/security").then(m => m.logInternalSecurityEvent("AUTH_SESSION_INVALID", "WARN", req, { message: err.message }));
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      await import("@/lib/auth/security").then(m => m.logInternalSecurityEvent("AUTHORIZATION_DENIAL", "CRITICAL", req, { message: err.message, resource: "invoice", id: params.id }));
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("invoice.get failed", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
