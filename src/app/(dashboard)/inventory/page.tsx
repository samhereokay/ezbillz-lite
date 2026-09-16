"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Skeleton, EmptyState } from "@/components/ui/shared";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";

type Warehouse = {
  id: string;
  name: string;
  isActive: boolean;
  isDefault: boolean;
  _count: { locations: number; stockBalances: number };
};

type LowStockItem = {
  id: string;
  product: { name: string; sku?: string; lowStockThreshold?: number };
  warehouse: { name: string };
  quantity: string;
};

type Movement = {
  id: string;
  type: string;
  quantity: string;
  createdAt: string;
  product: { name: string };
  Warehouse?: { name: string } | null;
};

type SummaryData = {
  warehouseCount: number;
  warehouses: Warehouse[];
  totalSkus: number;
  totalQuantity: number;
  recentMovements: Movement[];
  lowStock: LowStockItem[];
};

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  OPENING: "Opening",
  PURCHASE_RECEIPT: "Purchase In",
  SALE_ISSUE: "Sale Out",
  SALE_RETURN: "Sale Return",
  PURCHASE_RETURN: "Purchase Return",
  ADJUSTMENT: "Adjustment",
  TRANSFER_IN: "Transfer In",
  TRANSFER_OUT: "Transfer Out",
};

const MOVEMENT_TYPE_CLASSES: Record<string, string> = {
  PURCHASE_RECEIPT: "badge-green",
  OPENING: "badge-blue",
  TRANSFER_IN: "badge-blue",
  SALE_ISSUE: "badge-red",
  PURCHASE_RETURN: "badge-red",
  TRANSFER_OUT: "badge-red",
  ADJUSTMENT: "badge-amber",
  SALE_RETURN: "badge-green",
};

export default function InventoryDashboardPage() {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/inventory/summary");
      if (!res.ok) throw new Error("Failed to load inventory summary");
      const json = await res.json();
      setData(json);
    } catch {
      toast("Failed to load inventory data", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Inventory</h1>
          <p className="text-muted">Overview of your stock, warehouses and movements</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/inventory/import" className="btn-secondary text-sm">
            Import CSV
          </Link>
          <Link href="/inventory/adjustments" className="btn-primary text-sm">
            + Adjust Stock
          </Link>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="stat-card gap-4">
              <Skeleton className="w-11 h-11 rounded-xl flex-shrink-0" />
              <div className="space-y-2 flex-1"><Skeleton className="h-3 w-20" /><Skeleton className="h-7 w-28" /></div>
            </div>
          ))
        ) : (
          <>
            <div className="stat-card gap-4">
              <div className="stat-icon bg-brand-50 text-brand-600">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
              </div>
              <div>
                <p className="text-muted text-sm">Active Warehouses</p>
                <p className="text-2xl font-bold text-gray-900">{data?.warehouseCount ?? 0}</p>
              </div>
            </div>
            <div className="stat-card gap-4">
              <div className="stat-icon bg-blue-50 text-blue-600">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <div>
                <p className="text-muted text-sm">Total SKUs</p>
                <p className="text-2xl font-bold text-gray-900">{data?.totalSkus ?? 0}</p>
              </div>
            </div>
            <div className="stat-card gap-4">
              <div className="stat-icon bg-green-50 text-green-600">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div>
                <p className="text-muted text-sm">Total Quantity</p>
                <p className="text-2xl font-bold text-gray-900">{Number(data?.totalQuantity ?? 0).toFixed(0)}</p>
              </div>
            </div>
            <div className={`stat-card gap-4 ${(data?.lowStock.length ?? 0) > 0 ? "border-red-200 bg-red-50" : ""}`}>
              <div className={`stat-icon ${(data?.lowStock.length ?? 0) > 0 ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-400"}`}>
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-muted text-sm">Low Stock Alerts</p>
                <p className={`text-2xl font-bold ${(data?.lowStock.length ?? 0) > 0 ? "text-red-600" : "text-gray-900"}`}>
                  {data?.lowStock.length ?? 0}
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-sm font-semibold text-gray-900">Quick Actions</h2>
          </div>
          <div className="card-body p-0">
            <div className="divide-y divide-gray-100">
              {[
                { href: "/inventory/adjustments", label: "Adjust Stock", desc: "Add or remove stock manually", icon: "M12 9v3m0 0v3m0-3h3m-3 0H9", color: "text-brand-600 bg-brand-50" },
                { href: "/inventory/warehouses", label: "Add Warehouse", desc: "Set up a new storage location", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6", color: "text-blue-600 bg-blue-50" },
                { href: "/inventory/import", label: "Import CSV", desc: "Bulk import products, customers, suppliers", icon: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12", color: "text-green-600 bg-green-50" },
                { href: "/inventory/ledger", label: "View Ledger", desc: "See all stock movements", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2", color: "text-purple-600 bg-purple-50" },
                { href: "/api/export/stock", label: "Export Stock", desc: "Download CSV of current stock balance", icon: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4", color: "text-amber-600 bg-amber-50", download: true },
              ].map(action => (
                action.download ? (
                  <a
                    key={action.href}
                    href={action.href}
                    download
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group"
                    aria-label={action.label}
                  >
                    <div className={`w-8 h-8 rounded-lg ${action.color} flex items-center justify-center flex-shrink-0`}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={action.icon} />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 group-hover:text-brand-600 transition-colors">{action.label}</p>
                      <p className="text-xs text-gray-500 truncate">{action.desc}</p>
                    </div>
                  </a>
                ) : (
                  <Link
                    key={action.href}
                    href={action.href}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group"
                  >
                    <div className={`w-8 h-8 rounded-lg ${action.color} flex items-center justify-center flex-shrink-0`}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={action.icon} />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 group-hover:text-brand-600 transition-colors">{action.label}</p>
                      <p className="text-xs text-gray-500 truncate">{action.desc}</p>
                    </div>
                    <svg className="w-4 h-4 text-gray-300 group-hover:text-brand-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                )
              ))}
            </div>
          </div>
        </div>

        {/* Recent Movements */}
        <div className="card xl:col-span-2">
          <div className="card-header flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Recent Movements</h2>
            <Link href="/inventory/ledger" className="text-xs text-brand-600 hover:underline">View all →</Link>
          </div>
          <div className="card-body p-0">
            {loading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : !data?.recentMovements.length ? (
              <EmptyState
                icon={<svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>}
                title="No movements yet"
                description="Stock movements will appear here once you start adjusting or receiving inventory."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Type</th>
                      <th>Qty</th>
                      <th>Warehouse</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentMovements.map(m => (
                      <tr key={m.id}>
                        <td className="font-medium text-gray-900 max-w-[180px] truncate">{m.product.name}</td>
                        <td>
                          <span className={`badge ${MOVEMENT_TYPE_CLASSES[m.type] ?? "badge-gray"} text-xs`}>
                            {MOVEMENT_TYPE_LABELS[m.type] ?? m.type}
                          </span>
                        </td>
                        <td className={`font-mono font-medium ${Number(m.quantity) < 0 ? "text-red-600" : "text-green-600"}`}>
                          {Number(m.quantity) > 0 ? "+" : ""}{Number(m.quantity).toFixed(2)}
                        </td>
                        <td className="text-gray-500 text-sm">{m.Warehouse?.name ?? "—"}</td>
                        <td className="text-gray-500 text-sm whitespace-nowrap">{formatDate(m.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Low Stock Alerts */}
      {!loading && (data?.lowStock.length ?? 0) > 0 && (
        <div className="card border-red-200">
          <div className="card-header bg-red-50 border-b border-red-100">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h2 className="text-sm font-semibold text-red-800">Low Stock Alerts ({data!.lowStock.length})</h2>
            </div>
          </div>
          <div className="card-body p-0">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Warehouse</th>
                    <th>Current Qty</th>
                    <th>Threshold</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data!.lowStock.map(item => (
                    <tr key={item.id}>
                      <td className="font-medium text-gray-900">{item.product.name}</td>
                      <td className="font-mono text-gray-500 text-sm">{item.product.sku ?? "—"}</td>
                      <td className="text-gray-500 text-sm">{item.warehouse.name}</td>
                      <td className="font-mono font-medium text-red-600">{Number(item.quantity).toFixed(2)}</td>
                      <td className="font-mono text-gray-500">{item.product.lowStockThreshold ?? 0}</td>
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
          </div>
        </div>
      )}

      {/* Warehouses */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Warehouses</h2>
          <Link href="/inventory/warehouses" className="text-xs text-brand-600 hover:underline">Manage →</Link>
        </div>
        <div className="card-body p-0">
          {loading ? (
            <div className="p-4 space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : !data?.warehouses.length ? (
            <EmptyState
              icon={<svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>}
              title="No warehouses"
              description="Create your first warehouse to start tracking inventory."
              action={<Link href="/inventory/warehouses" className="btn-primary text-sm">Add Warehouse</Link>}
            />
          ) : (
            <div className="divide-y divide-gray-100">
              {data.warehouses.map(wh => (
                <div key={wh.id} className="flex items-center gap-4 px-4 py-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 truncate">{wh.name}</p>
                      {wh.isDefault && <span className="badge badge-blue text-xs">Default</span>}
                      {!wh.isActive && <span className="badge badge-gray text-xs">Archived</span>}
                    </div>
                    <p className="text-xs text-gray-500">
                      {wh._count.locations} location{wh._count.locations !== 1 ? "s" : ""} ·{" "}
                      {wh._count.stockBalances} SKU{wh._count.stockBalances !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
