import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/db/client";
import { requireOrgContext, UnauthorizedError, ForbiddenError } from "../../../../../server/tenant";
import { renderInvoicePdf } from "../../../../../lib/documents/invoicePdf";
import { getStorageProvider } from "../../../../../lib/storage";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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

    // Persist to the org's configured storage so re-downloads don't
    // require regenerating the PDF, and so it can be uploaded to the
    // user's own Google Drive if connected (future: check StorageConnection
    // first and fall back to the app-wide provider).
    const storage = getStorageProvider();
    const stored = await storage.putObject({
      organizationId: ctx.organizationId,
      purpose: "invoice_pdf",
      filename: `${invoice.number}.pdf`,
      contentType: "application/pdf",
      body: Buffer.from(pdfBytes),
    });

    const storedFile = await prisma.storedFile.create({
      data: {
        organizationId: ctx.organizationId,
        provider: storage.name,
        storageKey: stored.storageKey,
        remoteFileId: stored.remoteFileId,
        filename: `${invoice.number}.pdf`,
        contentType: "application/pdf",
        sizeBytes: stored.sizeBytes,
        purpose: "invoice_pdf",
      },
    });

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { pdfFileId: storedFile.id },
    });

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
