import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext, UnauthorizedError, ForbiddenError } from "@/server/tenant";
import { getSubscriptionContext } from "@/server/subscription";
import { getPricingCatalog } from "@/server/catalog";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireOrgContext();
    const subContext = await getSubscriptionContext(ctx.organizationId);
    return NextResponse.json({ subscription: subContext, catalog: getPricingCatalog() });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      await import("@/lib/auth/security").then(m => m.logInternalSecurityEvent("AUTH_SESSION_INVALID", "WARN", req, { message: err.message }));
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      await import("@/lib/auth/security").then(m => m.logInternalSecurityEvent("AUTHORIZATION_DENIAL", "CRITICAL", req, { message: err.message }));
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error(err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
