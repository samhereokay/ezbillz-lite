import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/client";
import { requireOrgContext } from "@/server/tenant";
import { formatINR } from "@/lib/utils";
import Link from "next/link";

async function getGstData() {
  const ctx = await requireOrgContext();
  const orgId = ctx.organizationId;

  const [invoices, purchases, org] = await Promise.all([
    prisma.invoice.findMany({
      where: { organizationId: orgId, status: "ISSUED" },
      include: { items: true },
      orderBy: { issueDate: "desc" },
    }),
    prisma.purchase.findMany({
      where: { organizationId: orgId, status: "RECORDED" },
      orderBy: { billDate: "desc" },
    }),
    prisma.organization.findUniqueOrThrow({ where: { id: orgId } }),
  ]);

  // HSN-wise summary
  const hsnMap = new Map<string, { description: string; taxable: number; cgst: number; sgst: number; igst: number }>();
  for (const inv of invoices) {
    for (const item of inv.items) {
      const hsn = item.hsnCode ?? "N/A";
      const existing = hsnMap.get(hsn) ?? { description: item.description, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
      existing.taxable += Number(item.taxableValue);
      existing.cgst   += Number(item.cgstAmount);
      existing.sgst   += Number(item.sgstAmount);
      existing.igst   += Number(item.igstAmount);
      hsnMap.set(hsn, existing);
    }
  }

  const totalSalesTaxable = invoices.reduce((s, i) => s + Number(i.taxableTotal), 0);
  const totalCgst   = invoices.reduce((s, i) => s + Number(i.cgstTotal), 0);
  const totalSgst   = invoices.reduce((s, i) => s + Number(i.sgstTotal), 0);
  const totalIgst   = invoices.reduce((s, i) => s + Number(i.igstTotal), 0);
  const totalSalesTax = totalCgst + totalSgst + totalIgst;

  const totalPurchaseTax = purchases.reduce((s, p) => s + Number(p.cgstTotal) + Number(p.sgstTotal) + Number(p.igstTotal), 0);
  const netPayable = totalSalesTax - totalPurchaseTax;

  return { org, invoices, totalSalesTaxable, totalCgst, totalSgst, totalIgst, totalSalesTax, totalPurchaseTax, netPayable, hsnSummary: Array.from(hsnMap.entries()).map(([hsn, v]) => ({ hsn, ...v })) };
}

export default async function GstReportPage() {
  let data: Awaited<ReturnType<typeof getGstData>> | null = null;
  try { data = await getGstData(); } catch { return <p className="text-red-600 p-6">Failed to load GST data</p>; }

  await getServerSession(authOptions); // session already checked in layout

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">GST Summary</h1>
          <p className="text-muted">GSTIN: {data!.org.gstin ?? "Not set"} · State: {data!.org.state} ({data!.org.stateCode})</p>
        </div>
        <Link href="/settings" className="btn-secondary">Update GST Details</Link>
      </div>

      {/* Tax summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Taxable Sales", value: formatINR(data!.totalSalesTaxable), color: "bg-blue-50 text-blue-700" },
          { label: "CGST Collected", value: formatINR(data!.totalCgst), color: "bg-indigo-50 text-indigo-700" },
          { label: "SGST Collected", value: formatINR(data!.totalSgst), color: "bg-violet-50 text-violet-700" },
          { label: "IGST Collected", value: formatINR(data!.totalIgst), color: "bg-purple-50 text-purple-700" },
        ].map(c => (
          <div key={c.label} className="card p-4">
            <p className="text-xs text-gray-500 font-medium">{c.label}</p>
            <p className={`text-xl font-bold mt-1 inr ${c.color.split(" ")[1]}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Net GST payable */}
      <div className="card p-6 bg-gradient-to-r from-brand-50 to-blue-50 border-brand-200">
        <div className="grid grid-cols-3 gap-6 text-center">
          <div>
            <p className="text-sm text-gray-600">Output Tax (Sales)</p>
            <p className="text-2xl font-bold text-gray-900 inr mt-1">{formatINR(data!.totalSalesTax)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Input Tax Credit (Purchases)</p>
            <p className="text-2xl font-bold text-green-700 inr mt-1">−{formatINR(data!.totalPurchaseTax)}</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-700">Net GST Payable</p>
            <p className={`text-3xl font-bold mt-1 inr ${data!.netPayable >= 0 ? "text-red-700" : "text-green-700"}`}>
              {formatINR(Math.abs(data!.netPayable))}{data!.netPayable < 0 ? " (Credit)" : ""}
            </p>
          </div>
        </div>
      </div>

      {/* HSN Summary */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-sm font-semibold text-gray-900">HSN / SAC Summary</h2>
          <span className="text-xs text-gray-400">{data!.hsnSummary.length} codes</span>
        </div>
        {data!.hsnSummary.length === 0 ? (
          <div className="card-body py-8 text-center text-gray-400 text-sm">No issued invoices yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr><th>HSN/SAC</th><th>Description</th><th>Taxable Value</th><th>CGST</th><th>SGST</th><th>IGST</th><th>Total Tax</th></tr>
              </thead>
              <tbody>
                {data!.hsnSummary.map(row => (
                  <tr key={row.hsn}>
                    <td className="font-mono font-medium">{row.hsn}</td>
                    <td className="text-gray-600 max-w-xs truncate">{row.description}</td>
                    <td className="inr">{formatINR(row.taxable)}</td>
                    <td className="inr">{formatINR(row.cgst)}</td>
                    <td className="inr">{formatINR(row.sgst)}</td>
                    <td className="inr">{formatINR(row.igst)}</td>
                    <td className="inr font-semibold">{formatINR(row.cgst + row.sgst + row.igst)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
