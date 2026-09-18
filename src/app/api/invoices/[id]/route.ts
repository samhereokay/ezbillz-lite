import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireOrgContext, UnauthorizedError, ForbiddenError } from "@/server/tenant";

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
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
    if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ invoice });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("invoice.get failed", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
