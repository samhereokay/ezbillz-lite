import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireOrgContext, UnauthorizedError, ForbiddenError } from "@/server/tenant";

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  legalName: z.string().max(200).optional(),
  gstin: z.string().length(15).optional(),
  state: z.string().optional(),
  stateCode: z.string().length(2).optional(),
  addressLine1: z.string().max(300).optional(),
  city: z.string().max(100).optional(),
  pincode: z.string().max(10).optional(),
  invoicePrefix: z.string().max(20).optional(),
});

export async function GET() {
  try {
    const ctx = await requireOrgContext();
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId } });
    return NextResponse.json({ org, role: ctx.role });
  } catch (err) { return handleAuthError(err); }
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  try {
    const ctx = await requireOrgContext();
    if (ctx.role !== "OWNER" && ctx.role !== "ADMIN")
      return NextResponse.json({ error: "Insufficient role" }, { status: 403 });
    const org = await prisma.organization.update({
      where: { id: ctx.organizationId },
      data: parsed.data,
    });
    return NextResponse.json({ org });
  } catch (err) { return handleAuthError(err); }
}

function handleAuthError(err: unknown) {
  if (err instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (err instanceof ForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  console.error(err);
  return NextResponse.json({ error: "Request failed" }, { status: 500 });
}
