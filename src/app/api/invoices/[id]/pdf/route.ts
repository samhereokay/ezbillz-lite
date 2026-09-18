import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/db/client";
import { requireOrgContext, UnauthorizedError, ForbiddenError } from "../../../../../server/tenant";
import { renderInvoicePdf } from "../../../../../lib/documents/invoicePdf";
import { getStorageProvider } from "../../../../../lib/storage";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const orgId = req.nextUrl.searchParams.get("organizationId");
  if (!orgId) return NextResponse.json({ error: "organizationId is required" }, { status: 400 });

  try {
    const ctx = await requireOrgContext(orgId);

    // Scope strictly by organizationId — a valid invoice id from another
    // tenant must 404, not 200, to prevent IDOR.
    const invoice = await prisma.invoice.findFirst({
      where: { id: params.id, organizationId: ctx.organizationId },
      include: { items: true, customer: true, organization: true },
    });
    if (!invoice) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const pdfBytes = await renderInvoicePdf(invoice, invoice.organization, invoice.customer);

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${invoice.number}.pdf"`,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("invoice.pdf failed", err);
    return NextResponse.json({ error: "Could not generate PDF" }, { status: 500 });
  }
}
