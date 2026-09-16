import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext, UnauthorizedError, ForbiddenError } from "@/server/tenant";
import { exportCustomersCsv } from "@/server/csvService";

export async function GET(_req: NextRequest) {
  try {
    const ctx = await requireOrgContext();
    const csvContent = await exportCustomersCsv(ctx.organizationId);
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="customers_export.csv"',
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("Customer CSV Export error:", err);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
