"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { SearchInput, EmptyState, TableSkeleton } from "@/components/ui/shared";
import { useToast } from "@/components/ui/toast";
import { formatINR, formatDate, paymentMethodLabel } from "@/lib/utils";

type Payment = {
  id: string;
  direction: "RECEIVED" | "PAID";
  method: string;
  amount: string;
  paidAt: string;
  note?: string;
  customer?: { name: string } | null;
  supplier?: { name: string } | null;
  invoice?: { number: string } | null;
};

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"ALL" | "RECEIVED" | "PAID">("ALL");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/payments");
      if (res.ok) {
        const d = await res.json();
        setPayments(d.payments ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = payments.filter((p) => tab === "ALL" || p.direction === tab);
  const totalReceived = payments
    .filter((p) => p.direction === "RECEIVED")
    .reduce((s, p) => s + Number(p.amount), 0);
  const totalPaid = payments
    .filter((p) => p.direction === "PAID")
    .reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Payments</h1>
          <p className="text-muted">{payments.length} transactions</p>
        </div>
        <Link href="/payments/new" className="btn-primary" id="record-payment-btn">
          <svg
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            className="w-4 h-4"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Record Payment
        </Link>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card p-4 flex items-center gap-4">
          <div className="stat-icon bg-green-50 text-green-600">
            <svg
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.8}
              className="w-5 h-5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <div>
            <p className="text-xs text-gray-500">Total Received</p>
            <p className="text-xl font-bold text-gray-900 inr">{formatINR(totalReceived)}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-4">
          <div className="stat-icon bg-red-50 text-red-500">
            <svg
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.8}
              className="w-5 h-5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
            </svg>
          </div>
          <div>
            <p className="text-xs text-gray-500">Total Paid Out</p>
            <p className="text-xl font-bold text-gray-900 inr">{formatINR(totalPaid)}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(["ALL", "RECEIVED", "PAID"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t
                ? "bg-brand-600 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {t === "ALL" ? "All" : t === "RECEIVED" ? "Received" : "Paid Out"}
          </button>
        ))}
      </div>

      <div className="card">
        {loading ? (
          <TableSkeleton rows={5} cols={6} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={
              <svg
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
                className="w-8 h-8"
              >
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <path strokeLinecap="round" d="M2 10h20" />
              </svg>
            }
            title="No payments yet"
            description="Record your first payment"
            action={
              <Link href="/payments/new" className="btn-primary btn-sm">
                Record Payment
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Direction</th>
                  <th>Party</th>
                  <th>Invoice</th>
                  <th>Method</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id}>
                    <td className="text-xs text-gray-500">{formatDate(p.paidAt)}</td>
                    <td>
                      <span
                        className={p.direction === "RECEIVED" ? "badge-green" : "badge-red"}
                      >
                        {p.direction === "RECEIVED" ? "Received" : "Paid"}
                      </span>
                    </td>
                    <td className="font-medium">
                      {p.customer?.name ?? p.supplier?.name ?? "—"}
                    </td>
                    <td className="font-mono text-xs text-brand-600">
                      {p.invoice?.number ?? "—"}
                    </td>
                    <td className="text-gray-600">{paymentMethodLabel(p.method)}</td>
                    <td
                      className={`font-semibold inr ${
                        p.direction === "RECEIVED" ? "text-green-700" : "text-red-700"
                      }`}
                    >
                      {p.direction === "RECEIVED" ? "+" : "−"}
                      {formatINR(Number(p.amount))}
                    </td>
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
