"use client";

import { useState, useEffect, useCallback } from "react";
import { SearchInput, EmptyState, Skeleton } from "@/components/ui/shared";
import { useToast } from "@/components/ui/toast";
import Link from "next/link";

type BalanceRow = {
  id: string;
  productId: string;
  warehouseId: string;
  locationId: string | null;
  quantity: string;
  product: { name: string; sku?: string; unit: string; lowStockThreshold?: number };
  warehouse: { name: string };
  location?: { name: string } | null;
};

export default function StockPage() {
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ take: "200" });
      const res = await fetch(`/api/inventory?${params}`);
      if (!res.ok) throw new Error("Failed to load stock");
      const json = await res.json();
      setBalances(json.balances);
    } catch {
      toast("Failed to load stock data", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const filtered = balances.filter(b => {
    const matchSearch = !search || b.product.name.toLowerCase().includes(search.toLowerCase()) || b.product.sku?.toLowerCase().includes(search.toLowerCase());
    const matchLowStock = !lowStockOnly || Number(b.quantity) <= (b.product.lowStockThreshold ?? 0);
    return matchSearch && matchLowStock;
  });

  const isLow = (b: BalanceRow) => Number(b.quantity) <= (b.product.lowStockThreshold ?? 0);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Stock Balances</h1>
          <p className="text-muted">Current inventory levels across all warehouses</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <a href="/api/export/stock" download className="btn-secondary text-sm" aria-label="Export stock balance as CSV">
            Export CSV
          </a>
          <Link href="/inventory/adjustments" className="btn-primary text-sm">
            + Adjust Stock
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search products…"
          className="flex-1 min-w-[200px] max-w-xs"
        />
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={e => setLowStockOnly(e.target.checked)}
            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            aria-label="Show low stock only"
          />
          Low stock only
        </label>
      </div>

      {/* Table */}
      <div className="card">
        <div className="card-body p-0">
          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>}
              title={search || lowStockOnly ? "No matching items" : "No stock records"}
              description={search || lowStockOnly ? "Try adjusting your filters." : "Start by adjusting stock or recording purchases."}
              action={<Link href="/inventory/adjustments" className="btn-primary text-sm">Adjust Stock</Link>}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Warehouse</th>
                    <th>Location</th>
                    <th>Unit</th>
                    <th className="text-right">Quantity</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(b => (
                    <tr key={b.id} className={isLow(b) ? "bg-red-50/50" : ""}>
                      <td className="font-medium text-gray-900">{b.product.name}</td>
                      <td className="font-mono text-gray-500 text-sm">{b.product.sku ?? "—"}</td>
                      <td className="text-gray-600 text-sm">{b.warehouse.name}</td>
                      <td className="text-gray-500 text-sm">{b.location?.name ?? "—"}</td>
                      <td className="text-gray-500 text-sm">{b.product.unit}</td>
                      <td className={`text-right font-mono font-medium ${isLow(b) ? "text-red-600" : "text-gray-900"}`}>
                        {Number(b.quantity).toFixed(3)}
                      </td>
                      <td>
                        {isLow(b) ? (
                          <span className="badge badge-red text-xs">Low Stock</span>
                        ) : (
                          <span className="badge badge-green text-xs">In Stock</span>
                        )}
                      </td>
                      <td>
                        <Link href="/inventory/adjustments" className="text-brand-600 text-xs hover:underline">
                          Adjust
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
