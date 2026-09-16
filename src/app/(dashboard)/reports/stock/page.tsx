import { prisma } from "@/lib/db/client";
import { requireOrgContext } from "@/server/tenant";
import { formatINR } from "@/lib/utils";
import Link from "next/link";

async function getStockData() {
  const ctx = await requireOrgContext();
  const orgId = ctx.organizationId;

  const products = await prisma.product.findMany({
    where: { organizationId: orgId, deletedAt: null, isService: false },
    orderBy: { name: "asc" },
  });

  const stockByProduct = await prisma.stockMovement.groupBy({
    by: ["productId"],
    where: { organizationId: orgId },
    _sum: { quantity: true },
  });

  const ledgerByProduct = await prisma.stockMovement.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { product: { select: { name: true } } },
  });

  const stockMap = new Map(stockByProduct.map(s => [s.productId, Number(s._sum.quantity ?? 0)]));

  return {
    products: products.map(p => ({
      ...p,
      currentStock: stockMap.get(p.id) ?? 0,
      isLow: (stockMap.get(p.id) ?? 0) <= (p.lowStockThreshold ?? 0),
    })),
    ledger: ledgerByProduct,
  };
}

const MOVEMENT_LABELS: Record<string, string> = {
  OPENING: "Opening Stock", PURCHASE_RECEIPT: "Purchase Receipt", SALE_ISSUE: "Sale Issue",
  SALE_RETURN: "Sale Return", PURCHASE_RETURN: "Purchase Return", ADJUSTMENT: "Adjustment",
};

export default async function StockReportPage() {
  let data: Awaited<ReturnType<typeof getStockData>> | null = null;
  try { data = await getStockData(); } catch { return <p className="text-red-600 p-6">Failed to load stock data</p>; }

  const lowCount = data!.products.filter(p => p.isLow).length;
  const totalSkus = data!.products.length;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Stock Report</h1>
          <p className="text-muted">{totalSkus} products · {lowCount > 0 ? <span className="text-red-600 font-semibold">{lowCount} low stock</span> : "All stocked"}</p>
        </div>
        <Link href="/products" className="btn-primary">Manage Products</Link>
      </div>

      {/* Products stock table */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-sm font-semibold">Current Stock Levels</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>Product</th><th>HSN/SAC</th><th>Unit</th><th>Current Stock</th><th>Low Alert</th><th>Sale Price</th><th>Status</th></tr></thead>
            <tbody>
              {data!.products.map(p => (
                <tr key={p.id}>
                  <td className="font-medium">{p.name}</td>
                  <td className="font-mono text-xs text-gray-500">{p.hsnCode ?? "—"}</td>
                  <td className="text-gray-600">{p.unit}</td>
                  <td className={`font-semibold ${p.isLow ? "text-red-600" : "text-gray-900"}`}>{p.currentStock}</td>
                  <td className="text-gray-500">{p.lowStockThreshold ?? 0}</td>
                  <td className="inr">{formatINR(Number(p.salePrice))}</td>
                  <td>
                    {p.isLow
                      ? <span className="badge-red">⚠ Low Stock</span>
                      : <span className="badge-green">OK</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent ledger */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-sm font-semibold">Recent Stock Movements</h2>
          <span className="text-xs text-gray-400">Last 50 entries</span>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>Date</th><th>Product</th><th>Type</th><th>Qty Change</th><th>Reference</th></tr></thead>
            <tbody>
              {data!.ledger.map(m => (
                <tr key={m.id}>
                  <td className="text-xs text-gray-500">{new Date(m.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                  <td className="font-medium">{m.product.name}</td>
                  <td><span className={Number(m.quantity) >= 0 ? "badge-green" : "badge-red"}>{MOVEMENT_LABELS[m.type] ?? m.type}</span></td>
                  <td className={`font-mono font-semibold ${Number(m.quantity) >= 0 ? "text-green-700" : "text-red-700"}`}>
                    {Number(m.quantity) > 0 ? "+" : ""}{Number(m.quantity).toFixed(2)}
                  </td>
                  <td className="text-xs text-gray-500">{m.referenceType ?? "—"} {m.referenceId ? m.referenceId.slice(-6) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
