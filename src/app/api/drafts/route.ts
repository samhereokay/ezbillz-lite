import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireOrgContext, UnauthorizedError, ForbiddenError } from "@/server/tenant";
import { z } from "zod";
import { DraftType } from "@prisma/client";

const draftSchema = z.object({
  type: z.nativeEnum(DraftType),
  title: z.string().optional(),
  entityId: z.string().optional(),
  payload: z.record(z.any()), // We sanitize explicitly per-type below
});

// Explicit allowlist of allowed fields per draft type.
// If a form sends something not in this list, it is stripped.
// NEVER ALLOW: passwords, tokens, API keys, credentials, org IDs.
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

export async function GET(req: NextRequest) {
  try {
    const { userId, organizationId } = await requireOrgContext();
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const entityId = searchParams.get("entityId");

    const where: any = { organizationId, userId };
    
    if (type) {
      if (!Object.values(DraftType).includes(type as DraftType)) {
        return NextResponse.json({ error: "Invalid draft type" }, { status: 400 });
      }
      where.type = type as DraftType;
    }
    
    if (entityId !== null) { // null if not provided, can be "" if explicit empty
      if (entityId === "null" || entityId === "") {
         where.entityId = null;
      } else {
         where.entityId = entityId;
      }
    }

    const drafts = await prisma.draft.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ drafts });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("Draft GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, organizationId } = await requireOrgContext();
    const body = await req.json();
    
    // Check max payload size (in bytes if stringified) approx
    const bodyStr = JSON.stringify(body);
    if (bodyStr.length > 50000) {
      return NextResponse.json({ error: "Draft payload too large" }, { status: 413 });
    }

    const parsed = draftSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid draft payload", details: parsed.error.issues }, { status: 400 });
    }

    const { type, title, entityId, payload } = parsed.data;
    const sanitizedPayload = sanitizePayload(type, payload);

    const draft = await prisma.draft.create({
      data: {
        organizationId,
        userId,
        type,
        title,
        entityId: entityId || null,
        payload: sanitizedPayload,
        version: 1,
      },
    });

    return NextResponse.json({ draft }, { status: 201 });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("Draft POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}