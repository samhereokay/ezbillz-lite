"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { formatINR, formatDate, invoiceStatusClass, invoiceStatusLabel } from "@/lib/utils";
import { Skeleton } from "@/components/ui/shared";
import { useToast } from "@/components/ui/toast";
import { useSession } from "next-auth/react";
import { useCommandPalette } from "@/components/ui/CommandPalette";
import { useRecentItemRecord, RecentItemType } from "@/lib/recentHistory";

type InvoiceDetail = {
  id: string;
  number: string;
  status: string;
  type: string;
  issueDate: string;
  grandTotal: string;
  amountPaid: string;
  subtotal: string;
  taxableTotal: string;
  cgstTotal: string;
  sgstTotal: string;
  igstTotal: string;
  roundOff: string;
  customer: { name: string; gstin?: string; phone?: string; email?: string; state?: string; city?: string };
  items: Array<{
    id: string;
    description: string;
    hsnCode?: string;
    quantity: string;
    unit: string;
    unitPrice: string;
    discountPercent: string;
    gstRatePercent: string;
    taxableValue: string;
    cgstAmount: string;
    sgstAmount: string;
    igstAmount: string;
    lineTotal: string;
  }>;
};

export default function InvoiceDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const { toast } = useToast();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  
  const { data: session } = useSession();
  const { orgId } = useCommandPalette();
  
  useRecentItemRecord(
    (session?.user as any)?.id, 
    orgId, 
    invoice ? {
      id: `inv-${invoice.id}`,
      type: invoice.type as RecentItemType,
      title: invoice.number,
      subtitle: invoice.customer.name,
      url: `/invoices/${invoice.id}`
    } : null
  );

  useEffect(() => {
    fetch(`/api/invoices/${id}`)
      .then((r) => r.json())
      .then((d) => setInvoice(d.invoice ?? null))
      .catch(() => toast("Failed to load invoice", "error"))
      .finally(() => setLoading(false));
  }, [id, toast]);

  async function downloadPdf() {
    setPdfLoading(true);
    try {
      const res = await fetch(`/api/invoices/${id}/pdf`);
      if (!res.ok) throw new Error("PDF generation failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${invoice?.number ?? "invoice"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast("PDF downloaded");
    } catch {
      toast("Could not generate PDF", "error");
    } finally {
      setPdfLoading(false);
    }
  }

  async function handleDuplicate() {
    if (!confirm("Are you sure you want to duplicate this document?")) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/invoices/${id}/duplicate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to duplicate");
      toast("Document duplicated successfully");
      router.push(`/invoices/${data.duplicate.id}`);
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleConvert() {
    if (!confirm("Are you sure you want to convert this quotation to a tax invoice?")) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/invoices/${id}/convert`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to convert");
      toast("Quotation converted successfully");
      router.push(`/invoices/${data.invoice.id}`);
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 max-w-4xl">
        <Skeleton className="h-8 w-48"/>
        <div className="card p-6 space-y-3">
          {Array.from({length: 8}).map((_, i) => <Skeleton key={i} className="h-4 w-full"/>)}
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="card p-12 text-center max-w-md mx-auto">
        <p className="text-gray-500 mb-4">Invoice not found</p>
        <Link href="/invoices" className="btn-secondary">Back to Invoices</Link>
      </div>
    );
  }

  const balance = Number(invoice.grandTotal) - Number(invoice.amountPaid);
  const isInterState = Number(invoice.igstTotal) > 0;

  return (
    <div className="max-w-4xl space-y-4">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="btn-ghost btn-sm">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
            </svg>
            Back
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="page-title font-mono">{invoice.number}</h1>
              <span className={invoiceStatusClass(invoice.status)}>{invoiceStatusLabel(invoice.status)}</span>
            </div>
            <p className="text-muted">{formatDate(invoice.issueDate)}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {invoice.type === "QUOTATION" && invoice.status !== "CONVERTED" && (
             <button
               onClick={handleConvert}
               disabled={actionLoading}
               className="btn-secondary text-brand-600 hover:text-brand-700"
               id="convert-quotation-btn"
             >
               {actionLoading ? "Converting…" : "Convert to Invoice"}
             </button>
          )}
          <button
            onClick={handleDuplicate}
            disabled={actionLoading}
            className="btn-secondary"
            id="duplicate-btn"
          >
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
            </svg>
            Duplicate
          </button>
          <button
            onClick={downloadPdf}
            disabled={pdfLoading || actionLoading}
            className="btn-secondary"
            id="download-pdf-btn"
          >
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            {pdfLoading ? "Generating…" : "Download PDF"}
          </button>
          {invoice.type === "TAX_INVOICE" && (
            <Link href={`/payments/new?invoiceId=${invoice.id}`} className="btn-primary">
              Record Payment
            </Link>
          )}
        </div>
      </div>

      {/* Invoice card */}
      <div className="card">
        {/* Customer details */}
        <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-6 border-b border-gray-100">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Customer</p>
            <p className="text-base font-semibold text-gray-900">{invoice.customer.name}</p>
            {invoice.customer.gstin && <p className="text-xs font-mono text-gray-500 mt-0.5">GSTIN: {invoice.customer.gstin}</p>}
            {invoice.customer.phone && <p className="text-sm text-gray-600 mt-0.5">📞 {invoice.customer.phone}</p>}
            {invoice.customer.email && <p className="text-sm text-gray-600">✉ {invoice.customer.email}</p>}
            {invoice.customer.state && <p className="text-sm text-gray-500 mt-0.5">{invoice.customer.city ? `${invoice.customer.city}, ` : ""}{invoice.customer.state}</p>}
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Amount Due</p>
            <p className="text-3xl font-bold text-gray-900 inr">{formatINR(Number(invoice.grandTotal))}</p>
            {balance > 0 ? (
              <p className="text-sm text-amber-600 font-medium mt-1">{formatINR(balance)} outstanding</p>
            ) : (
              <p className="text-sm text-green-600 font-medium mt-1">Fully paid ✓</p>
            )}
            <p className="text-xs text-gray-400 mt-1">{isInterState ? "IGST (Inter-state)" : "CGST + SGST (Intra-state)"}</p>
          </div>
        </div>

        {/* Line items */}
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>HSN/SAC</th>
                <th>Qty</th>
                <th>Rate</th>
                <th>GST%</th>
                {isInterState
                  ? <th>IGST</th>
                  : <><th>CGST</th><th>SGST</th></>}
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item) => (
                <tr key={item.id}>
                  <td className="font-medium">{item.description}</td>
                  <td className="font-mono text-xs">{item.hsnCode ?? "—"}</td>
                  <td>{Number(item.quantity)} {item.unit}</td>
                  <td className="inr">{formatINR(Number(item.unitPrice))}</td>
                  <td>{Number(item.gstRatePercent)}%</td>
                  {isInterState
                    ? <td className="inr">{formatINR(Number(item.igstAmount))}</td>
                    : <><td className="inr">{formatINR(Number(item.cgstAmount))}</td><td className="inr">{formatINR(Number(item.sgstAmount))}</td></>}
                  <td className="text-right font-semibold inr">{formatINR(Number(item.lineTotal))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="px-6 py-4 border-t border-gray-100">
          <div className="ml-auto max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span className="inr">{formatINR(Number(invoice.subtotal))}</span>
            </div>
            {Number(invoice.cgstTotal) > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>CGST</span>
                <span className="inr">{formatINR(Number(invoice.cgstTotal))}</span>
              </div>
            )}
            {Number(invoice.sgstTotal) > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>SGST</span>
                <span className="inr">{formatINR(Number(invoice.sgstTotal))}</span>
              </div>
            )}
            {Number(invoice.igstTotal) > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>IGST</span>
                <span className="inr">{formatINR(Number(invoice.igstTotal))}</span>
              </div>
            )}
            {Number(invoice.roundOff) !== 0 && (
              <div className="flex justify-between text-gray-500 text-xs">
                <span>Round Off</span>
                <span className="inr">{formatINR(Number(invoice.roundOff))}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base text-gray-900 pt-2 border-t border-gray-200">
              <span>Grand Total</span>
              <span className="inr">{formatINR(Number(invoice.grandTotal))}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
