"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { SearchInput, EmptyState, Skeleton } from "@/components/ui/shared";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";

type Movement = {
  id: string;
  type: string;
  quantity: string;
  createdAt: string;
  referenceType: string | null;
  referenceId: string | null;
  product: { name: string; sku: string | null };
  Warehouse: { name: string } | null;
  Location: { name: string } | null;
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

export default function StockLedgerPage() {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const { toast } = useToast();

  const take = 50;

  const load = useCallback(async (pageNum: number) => {
    setLoading(true);
    try {
      const skip = (pageNum - 1) * take;
      const params = new URLSearchParams({ take: take.toString(), skip: skip.toString() });
      const res = await fetch(`/api/inventory/ledger?${params}`);
      if (!res.ok) throw new Error("Failed to load ledger");
      const json = await res.json();
      setMovements(json.movements);
      setTotal(json.total);
    } catch {
      toast("Failed to load stock ledger", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(page); }, [load, page]);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Stock Ledger</h1>
          <p className="text-muted">Detailed history of all stock movements</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <a href="/api/export/stock-ledger" download className="btn-secondary text-sm" aria-label="Export stock ledger as CSV">
            Export CSV
          </a>
          <Link href="/inventory/adjustments" className="btn-primary text-sm">
            + Adjust Stock
          </Link>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="card-body p-0">
          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : movements.length === 0 ? (
            <EmptyState
              icon={<svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>}
              title="No movements found"
              description="Your stock ledger is empty."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Type</th>
                    <th>Warehouse</th>
                    <th>Location</th>
                    <th className="text-right">Qty</th>
                    <th>Ref</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map(m => (
                    <tr key={m.id}>
                      <td className="text-gray-500 text-sm whitespace-nowrap">{formatDate(m.createdAt)}</td>
                      <td className="font-medium text-gray-900 max-w-[200px] truncate" title={m.product.name}>{m.product.name}</td>
                      <td className="font-mono text-gray-500 text-sm">{m.product.sku ?? "—"}</td>
                      <td>
                        <span className={`badge ${MOVEMENT_TYPE_CLASSES[m.type] ?? "badge-gray"} text-xs`}>
                          {MOVEMENT_TYPE_LABELS[m.type] ?? m.type}
                        </span>
                      </td>
                      <td className="text-gray-600 text-sm">{m.Warehouse?.name ?? "—"}</td>
                      <td className="text-gray-500 text-sm">{m.Location?.name ?? "—"}</td>
                      <td className={`text-right font-mono font-medium ${Number(m.quantity) < 0 ? "text-red-600" : "text-green-600"}`}>
                        {Number(m.quantity) > 0 ? "+" : ""}{Number(m.quantity).toFixed(2)}
                      </td>
                      <td className="text-gray-400 text-xs truncate max-w-[150px]" title={m.referenceType ? `${m.referenceType}: ${m.referenceId}` : ""}>
                        {m.referenceType ? `${m.referenceType}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        
        {/* Pagination */}
        {total > take && (
          <div className="card-header border-t flex justify-between items-center bg-gray-50">
            <span className="text-sm text-gray-500">
              Showing {(page - 1) * take + 1} to {Math.min(page * take, total)} of {total}
            </span>
            <div className="flex gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="btn-secondary text-xs px-3 py-1"
              >
                Previous
              </button>
              <button
                disabled={page * take >= total}
                onClick={() => setPage(p => p + 1)}
                className="btn-secondary text-xs px-3 py-1"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
