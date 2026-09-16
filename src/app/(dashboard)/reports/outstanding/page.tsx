import { prisma } from "@/lib/db/client";
import { requireOrgContext } from "@/server/tenant";
import { formatINR, formatDate } from "@/lib/utils";
import Link from "next/link";

async function getOutstandingData() {
  const ctx = await requireOrgContext();
  const orgId = ctx.organizationId;

  const invoices = await prisma.invoice.findMany({
    where: { organizationId: orgId, status: "ISSUED" },
    include: { customer: { select: { name: true, phone: true } } },
    orderBy: { issueDate: "asc" },
  });

  return invoices
    .map(inv => ({
      id: inv.id,
      number: inv.number,
      issueDate: inv.issueDate,
      customerName: inv.customer.name,
      customerPhone: inv.customer.phone ?? null,
      grandTotal: Number(inv.grandTotal),
      amountPaid: Number(inv.amountPaid),
      balance: Number(inv.grandTotal) - Number(inv.amountPaid),
    }))
    .filter(inv => inv.balance > 0.01);
}

export default async function OutstandingPage() {
  let rows: Awaited<ReturnType<typeof getOutstandingData>> = [];
  try { rows = await getOutstandingData(); } catch { return <p className="text-red-600 p-6">Failed to load data</p>; }

  const total = rows.reduce((s, r) => s + r.balance, 0);
  const overdue30 = rows.filter(r => {
    const daysOld = Math.floor((Date.now() - new Date(r.issueDate).getTime()) / 86400000);
    return daysOld > 30;
  });

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Outstanding Receivables</h1>
          <p className="text-muted">{rows.length} unpaid invoices</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="card p-5">
          <p className="text-xs text-gray-500">Total Outstanding</p>
          <p className="text-2xl font-bold text-red-700 inr mt-1">{formatINR(total)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs text-gray-500">Invoices Pending</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{rows.length}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs text-gray-500">Overdue (&gt;30 days)</p>
          <p className={`text-2xl font-bold mt-1 ${overdue30.length > 0 ? "text-red-600" : "text-green-700"}`}>{overdue30.length}</p>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="text-sm font-semibold">Unpaid Invoices</h2>
        </div>
        {rows.length === 0 ? (
          <div className="card-body py-12 text-center">
            <p className="text-4xl mb-3">🎉</p>
            <p className="font-semibold text-gray-700">All invoices are paid!</p>
            <p className="text-sm text-gray-500 mt-1">No outstanding receivables</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Invoice #</th><th>Customer</th><th>Date</th><th>Invoice Total</th><th>Paid</th><th>Balance Due</th><th>Age (days)</th><th></th></tr></thead>
              <tbody>
                {rows.map(r => {
                  const daysOld = Math.floor((Date.now() - new Date(r.issueDate).getTime()) / 86400000);
                  return (
                    <tr key={r.id}>
                      <td><Link href={`/invoices/${r.id}`} className="font-mono text-brand-600 hover:text-brand-700 font-semibold text-xs">{r.number}</Link></td>
                      <td className="font-medium">{r.customerName}</td>
                      <td className="text-xs text-gray-500">{formatDate(r.issueDate)}</td>
                      <td className="inr">{formatINR(r.grandTotal)}</td>
                      <td className="inr text-green-700">{formatINR(r.amountPaid)}</td>
                      <td className="inr font-bold text-red-700">{formatINR(r.balance)}</td>
                      <td>
                        <span className={`badge ${daysOld > 60 ? "badge-red" : daysOld > 30 ? "badge-yellow" : "badge-gray"}`}>
                          {daysOld}d
                        </span>
                      </td>
                      <td>
                        <Link href={`/payments?invoiceId=${r.id}`} className="text-xs text-brand-600 hover:text-brand-700 font-medium whitespace-nowrap">
                          Record →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
