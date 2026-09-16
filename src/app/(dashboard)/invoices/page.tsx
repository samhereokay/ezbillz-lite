"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { formatINR, formatDate, invoiceStatusClass, invoiceStatusLabel } from "@/lib/utils";
import { SearchInput, EmptyState, TableSkeleton } from "@/components/ui/shared";

type Invoice = {
  id: string;
  number: string;
  status: string;
  type: string;
  issueDate: string;
  grandTotal: string;
  amountPaid: string;
  customer: { name: string };
};

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/invoices?take=100");
      if (res.ok) {
        const data = await res.json();
        setInvoices(data.invoices ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = invoices
    .filter((inv) => statusFilter === "ALL" || inv.status === statusFilter)
    .filter((inv) =>
      search === "" ||
      inv.number.toLowerCase().includes(search.toLowerCase()) ||
      inv.customer.name.toLowerCase().includes(search.toLowerCase())
    );

  const outstanding = invoices.reduce(
    (sum, inv) => sum + (Number(inv.grandTotal) - Number(inv.amountPaid)),
    0
  );

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Invoices</h1>
          <p className="text-muted mt-0.5">
            {invoices.length} total · Outstanding: <span className="text-amber-600 font-semibold">{formatINR(outstanding)}</span>
          </p>
        </div>
        <Link href="/invoices/new" className="btn-primary" id="create-invoice-btn">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
          </svg>
          New Invoice
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by number or customer…" className="flex-1 max-w-xs"/>
        <div className="flex items-center gap-2">
          {["ALL", "ISSUED", "DRAFT", "CANCELLED"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === s
                  ? "bg-brand-600 text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {s === "ALL" ? "All" : invoiceStatusLabel(s)}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        {loading ? (
          <TableSkeleton rows={6} cols={6}/>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>}
            title={search || statusFilter !== "ALL" ? "No invoices found" : "No invoices yet"}
            description="Create your first tax invoice to get started"
            action={<Link href="/invoices/new" className="btn-primary btn-sm">Create Invoice</Link>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Paid</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv) => {
                  const balance = Number(inv.grandTotal) - Number(inv.amountPaid);
                  return (
                    <tr key={inv.id}>
                      <td>
                        <Link href={`/invoices/${inv.id}`} className="font-mono font-semibold text-brand-600 hover:text-brand-700 text-xs">
                          {inv.number}
                        </Link>
                      </td>
                      <td className="font-medium">{inv.customer.name}</td>
                      <td className="text-gray-500 text-xs">{formatDate(inv.issueDate)}</td>
                      <td className="font-semibold inr">{formatINR(Number(inv.grandTotal))}</td>
                      <td className={balance > 0 ? "text-amber-600 font-medium inr" : "text-green-600 font-medium inr"}>
                        {balance > 0 ? `${formatINR(balance)} due` : "Paid"}
                      </td>
                      <td><span className={invoiceStatusClass(inv.status)}>{invoiceStatusLabel(inv.status)}</span></td>
                      <td>
                        <Link href={`/invoices/${inv.id}`} className="text-xs text-brand-600 hover:text-brand-700 font-medium whitespace-nowrap">
                          View →
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
