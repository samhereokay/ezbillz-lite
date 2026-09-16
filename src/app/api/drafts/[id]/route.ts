import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireOrgContext } from "@/server/tenant";
import { z } from "zod";
import { DraftType } from "@prisma/client";

const updateDraftSchema = z.object({
  title: z.string().optional(),
  payload: z.record(z.any()),
  version: z.number().int(),
});

// Explicit allowlist of allowed fields per draft type.
// Kept in sync with route.ts
const ALLOWED_FIELDS: Record<DraftType, string[]> = {
  TAX_INVOICE: ["customerId", "lines", "validUntil", "deliveryAddress", "vehicleNo", "transporter", "ewayBillNo", "reasonForMovement", "date", "notes", "terms"],
  QUOTATION: ["customerId", "lines", "validUntil", "notes", "terms"],
  DELIVERY_CHALLAN: ["customerId", "lines", "deliveryAddress", "vehicleNo", "transporter", "ewayBillNo", "reasonForMovement", "notes", "terms"],
  PURCHASE: ["supplierId", "lines", "billNumber", "billDate", "notes"],
  CUSTOMER: ["name", "gstin", "phone", "email", "state", "stateCode", "city", "addressLine1", "pincode", "openingBalance"],
  SUPPLIER: ["name", "gstin", "phone", "email", "state", "stateCode", "city", "addressLine1", "pincode", "openingBalance"],
  PRODUCT: ["name", "sku", "hsnCode", "isService", "unit", "salePrice", "purchasePrice", "gstRatePercent", "priceIncludesTax", "lowStockThreshold"],
  PAYMENT: ["direction", "method", "amount", "note", "customerId", "supplierId", "invoiceId", "purchaseId", "paidAt"],
};

function sanitizePayload(type: DraftType, payload: any) {
  const allowed = ALLOWED_FIELDS[type];
  if (!allowed) return {};
  
  const sanitized: Record<string, any> = {};
  for (const key of allowed) {
    if (payload[key] !== undefined) {
      sanitized[key] = payload[key];
    }
  }
  return sanitized;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { userId, organizationId } = await requireOrgContext();

    const draft = await prisma.draft.findUnique({
      where: { id: params.id },
    });

    if (!draft || draft.organizationId !== organizationId || draft.userId !== userId) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    return NextResponse.json({ draft });
  } catch (err: any) {
    if (err.name === "UnauthorizedError") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (err.name === "ForbiddenError") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("Draft GET [id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { userId, organizationId } = await requireOrgContext();
    const body = await req.json();
    
    const bodyStr = JSON.stringify(body);
    if (bodyStr.length > 50000) {
      return NextResponse.json({ error: "Draft payload too large" }, { status: 413 });
    }

    const parsed = updateDraftSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", details: parsed.error.issues }, { status: 400 });
    }

    const { title, payload, version } = parsed.data;

    // Must fetch first to authorize, get type, and check version
    const existing = await prisma.draft.findUnique({
      where: { id: params.id },
    });

    if (!existing || existing.organizationId !== organizationId || existing.userId !== userId) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    if (existing.version !== version) {
      return NextResponse.json({ error: "Conflict: Draft has been updated in another tab.", currentVersion: existing.version }, { status: 409 });
    }

    const sanitizedPayload = sanitizePayload(existing.type, payload);

    const updated = await prisma.draft.update({
      where: { id: params.id },
      data: {
        title: title !== undefined ? title : existing.title,
        payload: sanitizedPayload,
        version: existing.version + 1,
      },
    });

    return NextResponse.json({ draft: updated });
  } catch (err: any) {
    if (err.name === "UnauthorizedError") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (err.name === "ForbiddenError") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("Draft PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { userId, organizationId } = await requireOrgContext();

    const existing = await prisma.draft.findUnique({
      where: { id: params.id },
    });

    if (!existing || existing.organizationId !== organizationId || existing.userId !== userId) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    await prisma.draft.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err.name === "UnauthorizedError") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (err.name === "ForbiddenError") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("Draft DELETE error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}