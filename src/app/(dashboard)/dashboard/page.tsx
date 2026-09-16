import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/client";
import { requireOrgContext } from "@/server/tenant";
import Link from "next/link";
import { formatINR, formatDate, invoiceStatusClass, invoiceStatusLabel } from "@/lib/utils";

async function getDashboardData(userId: string) {
  // Get org context server-side
  const ctx = await requireOrgContext();
  const orgId = ctx.organizationId;

  // Run all queries in parallel
  const [invoiceSummary, recentInvoices, lowStockProducts, paymentSummary] = await Promise.all([
    // Invoice totals
    prisma.invoice.aggregate({
      where: { organizationId: orgId },
      _sum: { grandTotal: true, amountPaid: true },
      _count: { id: true },
    }),
    // Recent invoices
    prisma.invoice.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { customer: { select: { name: true } } },
    }),
    // Low-stock products
    prisma.product.findMany({
      where: { organizationId: orgId, deletedAt: null, isService: false },
      orderBy: { name: "asc" },
    }),
    // Payments this month
    prisma.payment.aggregate({
      where: {
        organizationId: orgId,
        direction: "RECEIVED",
        paidAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
      },
      _sum: { amount: true },
    }),
  ]);

  // Compute stock for low-stock check
  const stockByProduct = await prisma.stockMovement.groupBy({
    by: ["productId"],
    where: { organizationId: orgId },
    _sum: { quantity: true },
  });
  const stockMap = new Map(stockByProduct.map((s) => [s.productId, Number(s._sum.quantity ?? 0)]));
  const lowStock = lowStockProducts
    .filter((p) => {
      const current = stockMap.get(p.id) ?? 0;
      const threshold = p.lowStockThreshold ?? 0;
      return current <= threshold && !p.isService;
    })
    .slice(0, 5);

  const totalSales = Number(invoiceSummary._sum.grandTotal ?? 0);
  const totalPaid = Number(invoiceSummary._sum.amountPaid ?? 0);
  const outstanding = totalSales - totalPaid;

  return {
    orgId,
    totalSales,
    outstanding,
    invoiceCount: invoiceSummary._count.id,
    monthlyReceipts: Number(paymentSummary._sum.amount ?? 0),
    recentInvoices,
    lowStock: lowStock.map((p) => ({ ...p, currentStock: stockMap.get(p.id) ?? 0 })),
  };
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string })?.id ?? "";

  let data: Awaited<ReturnType<typeof getDashboardData>> | null = null;
  let error: string | null = null;

  try {
    data = await getDashboardData(userId);
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not load dashboard";
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-gray-500 mb-4">{error ?? "No organization found."}</p>
          <Link href="/settings" className="btn-primary">Setup Organization</Link>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      label: "Total Sales",
      value: formatINR(data.totalSales),
      sub: `${data.invoiceCount} invoice${data.invoiceCount !== 1 ? "s" : ""}`,
      color: "bg-brand-50 text-brand-600",
      icon: (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
      ),
    },
    {
      label: "Outstanding",
      value: formatINR(data.outstanding),
      sub: "receivable from customers",
      color: data.outstanding > 0 ? "bg-amber-50 text-amber-600" : "bg-green-50 text-green-600",
      icon: (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
      ),
    },
    {
      label: "This Month",
      value: formatINR(data.monthlyReceipts),
      sub: "payments received",
      color: "bg-green-50 text-green-600",
      icon: (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6">
          <rect x="2" y="5" width="20" height="14" rx="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path strokeLinecap="round" d="M2 10h20"/>
        </svg>
      ),
    },
    {
      label: "Low Stock",
      value: String(data.lowStock.length),
      sub: data.lowStock.length > 0 ? "items need attention" : "all items stocked",
      color: data.lowStock.length > 0 ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600",
      icon: (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
        </svg>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Welcome back, {session?.user?.name?.split(" ")[0]}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/invoices/new" className="btn-primary" id="new-invoice-btn">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
            </svg>
            New Invoice
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="stat-card">
            <div className={`stat-icon ${card.color}`}>{card.icon}</div>
            <div>
              <p className="text-xs font-medium text-gray-500">{card.label}</p>
              <p className="text-2xl font-bold text-gray-900 mt-0.5 inr">{card.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{card.sub}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Recent Invoices */}
        <div className="xl:col-span-2 card">
          <div className="card-header">
            <h2 className="text-sm font-semibold text-gray-900">Recent Invoices</h2>
            <Link href="/invoices" className="text-sm text-brand-600 hover:text-brand-700 font-medium">View all →</Link>
          </div>
          {data.recentInvoices.length === 0 ? (
            <div className="card-body empty-state py-10">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-10 h-10 text-gray-300 mb-3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
              <p className="text-sm text-gray-500">No invoices yet</p>
              <Link href="/invoices/new" className="btn-primary btn-sm mt-3">Create first invoice</Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Customer</th>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentInvoices.map((inv) => (
                    <tr key={inv.id}>
                      <td>
                        <Link href={`/invoices/${inv.id}`} className="font-mono text-brand-600 hover:text-brand-700 font-medium text-xs">
                          {inv.number}
                        </Link>
                      </td>
                      <td className="font-medium">{inv.customer.name}</td>
                      <td className="text-gray-500">{formatDate(inv.issueDate)}</td>
                      <td className="font-semibold inr">{formatINR(Number(inv.grandTotal))}</td>
                      <td><span className={invoiceStatusClass(inv.status)}>{invoiceStatusLabel(inv.status)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Quick actions */}
          <div className="card">
            <div className="card-header">
              <h2 className="text-sm font-semibold text-gray-900">Quick Actions</h2>
            </div>
            <div className="card-body grid grid-cols-2 gap-2">
              {[
                { href: "/invoices/new", label: "New Invoice", icon: "📄" },
                { href: "/customers/new", label: "Add Customer", icon: "👤" },
                { href: "/products/new", label: "Add Product", icon: "📦" },
                { href: "/payments/new", label: "Record Payment", icon: "💳" },
                { href: "/purchases/new", label: "Purchase Bill", icon: "🛒" },
                { href: "/reports/gst", label: "GST Summary", icon: "📊" },
              ].map((a) => (
                <Link
                  key={a.href}
                  href={a.href}
                  className="flex items-center gap-2 p-2.5 rounded-lg border border-gray-200 hover:border-brand-300 hover:bg-brand-50 transition-all text-xs font-medium text-gray-700"
                >
                  <span className="text-base">{a.icon}</span>
                  {a.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Low stock */}
          {data.lowStock.length > 0 && (
            <div className="card border-amber-200 bg-amber-50/30">
              <div className="card-header border-amber-100">
                <h2 className="text-sm font-semibold text-amber-800">⚠️ Low Stock Alert</h2>
                <Link href="/reports/stock" className="text-xs text-amber-700 hover:text-amber-800 font-medium">View all</Link>
              </div>
              <div className="card-body space-y-2">
                {data.lowStock.map((p) => (
                  <div key={p.id} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700 truncate">{p.name}</span>
                    <span className="text-xs font-semibold text-red-600 ml-2 flex-shrink-0">{p.currentStock} left</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
