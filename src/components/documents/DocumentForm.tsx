"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { GST_RATES, newIdempotencyKey, formatINR } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { InvoiceType } from "@prisma/client";
import { useAutoSave } from "@/hooks/useAutoSave";
import { DraftRecoveryBanner } from "@/components/documents/DraftRecoveryBanner";
import { DraftStatusIndicator } from "@/components/documents/DraftStatusIndicator";

type Line = {
  productId?: string;
  description: string;
  hsnCode: string;
  quantity: number;
  unitPrice: number;
  gstRatePercent: number;
  discountPercent: number;
};

type Customer = { id: string; name: string; gstin?: string; state?: string };
type Product  = { id: string; name: string; salePrice: string; gstRatePercent: string; hsnCode?: string; unit?: string };

function emptyLine(): Line {
  return { description: "", hsnCode: "", quantity: 1, unitPrice: 0, gstRatePercent: 18, discountPercent: 0 };
}

function calcLine(line: Line) {
  const gross = line.quantity * line.unitPrice;
  const taxable = gross * (1 - line.discountPercent / 100);
  const tax = taxable * (line.gstRatePercent / 100);
  return { taxable, tax, total: taxable + tax };
}

export default function DocumentForm({ type }: { type: InvoiceType }) {
  const router = useRouter();
  const { toast } = useToast();
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [customerId, setCustomerId] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey] = useState(newIdempotencyKey);
  const [loadingData, setLoadingData] = useState(true);

  // Document Specific Fields
  const [validUntil, setValidUntil] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [transporter, setTransporter] = useState("");
  const [ewayBillNo, setEwayBillNo] = useState("");
  const [reasonForMovement, setReasonForMovement] = useState("");
  
  const load = useCallback(async () => {
    try {
      const [cRes, pRes] = await Promise.all([
        fetch("/api/customers?take=200"),
        fetch("/api/products?take=200"),
      ]);
      const [cData, pData] = await Promise.all([cRes.json(), pRes.json()]);
      setCustomers(cData.customers ?? []);
      setProducts(pData.products ?? []);
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const { status, lastSavedAt, draftId, initializeDraft, clearDraft } = useAutoSave({
    type: (type === "QUOTATION" || type === "DELIVERY_CHALLAN" ? type : "TAX_INVOICE") as any,
    data: {
      customerId,
      lines,
      validUntil,
      deliveryAddress,
      vehicleNo,
      transporter,
      ewayBillNo,
      reasonForMovement,
    },
    enabled: !submitting,
  });

  const handleRecover = (recoveredDraftId: string, version: number, payload: any) => {
    if (payload.customerId) setCustomerId(payload.customerId);
    if (payload.lines) setLines(payload.lines);
    if (payload.validUntil) setValidUntil(payload.validUntil);
    if (payload.deliveryAddress) setDeliveryAddress(payload.deliveryAddress);
    if (payload.vehicleNo) setVehicleNo(payload.vehicleNo);
    if (payload.transporter) setTransporter(payload.transporter);
    if (payload.ewayBillNo) setEwayBillNo(payload.ewayBillNo);
    if (payload.reasonForMovement) setReasonForMovement(payload.reasonForMovement);
    
    initializeDraft(recoveredDraftId, version);
  };

  const updateLine = (i: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l));

  function fillFromProduct(i: number, productId: string) {
    const p = products.find((pr) => pr.id === productId);
    if (!p) return;
    updateLine(i, {
      productId: p.id,
      description: p.name,
      unitPrice: Number(p.salePrice),
      gstRatePercent: Number(p.gstRatePercent),
      hsnCode: p.hsnCode ?? "",
    });
  }

  // Live totals
  const totals = lines.reduce(
    (acc, l) => {
      const { taxable, tax, total } = calcLine(l);
      return { taxable: acc.taxable + taxable, tax: acc.tax + tax, total: acc.total + total };
    },
    { taxable: 0, tax: 0, total: 0 }
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId) { toast("Please select a customer", "error"); return; }
    if (lines.some((l) => !l.description || l.unitPrice <= 0)) {
      toast("All line items must have a description and price", "error"); return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          type,
          customerId, 
          idempotencyKey,
          draftId,
          lines,
          validUntil: validUntil ? new Date(validUntil).toISOString() : undefined,
          deliveryAddress: deliveryAddress || undefined,
          vehicleNo: vehicleNo || undefined,
          transporter: transporter || undefined,
          ewayBillNo: ewayBillNo || undefined,
          reasonForMovement: reasonForMovement || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? `Could not create ${type.toLowerCase()}`, "error");
        return;
      }
      clearDraft();
      toast(`${type === 'QUOTATION' ? 'Quotation' : type === 'DELIVERY_CHALLAN' ? 'Challan' : 'Invoice'} ${data.invoice.number} created!`);
      // All documents use the same detail view, but the link could be updated in the future
      router.push(`/invoices/${data.invoice.id}`);
    } catch {
      toast("Network error — please try again", "error");
    } finally {
      setSubmitting(false);
    }
  }

  const isQuotation = type === "QUOTATION";
  const isChallan = type === "DELIVERY_CHALLAN";
  const title = isQuotation ? "New Quotation" : isChallan ? "New Delivery Challan" : "New Invoice";

  return (
    <div className="max-w-4xl space-y-6">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="btn-ghost btn-sm">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
            </svg>
            Back
          </button>
          <h1 className="page-title">{title}</h1>
        </div>
        <DraftStatusIndicator status={status} lastSavedAt={lastSavedAt} />
      </div>

      <DraftRecoveryBanner type={(type === "QUOTATION" || type === "DELIVERY_CHALLAN" ? type : "TAX_INVOICE") as any} onRecover={handleRecover} />

      <form onSubmit={handleSubmit} id="new-document-form" className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Customer picker */}
          <div className="card">
            <div className="card-header">
              <h2 className="text-sm font-semibold text-gray-700">Bill To</h2>
              <Link href="/customers/new" className="btn-ghost btn-sm text-brand-600">+ New Customer</Link>
            </div>
            <div className="card-body">
              {loadingData ? (
                <div className="h-10 bg-gray-100 rounded-lg animate-pulse"/>
              ) : (
                <select
                  id="customer-select"
                  className="form-select"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  required
                >
                  <option value="">— Select Customer —</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.gstin ? ` · ${c.gstin}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Document Specific Data */}
          {isQuotation && (
            <div className="card">
              <div className="card-header">
                <h2 className="text-sm font-semibold text-gray-700">Quotation Details</h2>
              </div>
              <div className="card-body space-y-4">
                <div>
                  <label className="form-label text-xs">Valid Until</label>
                  <input
                    type="date"
                    className="form-input text-sm"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {isChallan && (
            <div className="card">
              <div className="card-header">
                <h2 className="text-sm font-semibold text-gray-700">Challan Details</h2>
              </div>
              <div className="card-body space-y-4">
                <div>
                  <label className="form-label text-xs">Delivery Address</label>
                  <textarea
                    className="form-input text-sm h-16"
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label text-xs">Vehicle No</label>
                    <input type="text" className="form-input text-sm" value={vehicleNo} onChange={e => setVehicleNo(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label text-xs">Transporter</label>
                    <input type="text" className="form-input text-sm" value={transporter} onChange={e => setTransporter(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label text-xs">E-Way Bill No</label>
                    <input type="text" className="form-input text-sm" value={ewayBillNo} onChange={e => setEwayBillNo(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label text-xs">Reason for Movement</label>
                    <input type="text" className="form-input text-sm" value={reasonForMovement} onChange={e => setReasonForMovement(e.target.value)} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Line items */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-sm font-semibold text-gray-700">Line Items</h2>
          </div>
          <div className="px-4 py-3 space-y-3">
            {lines.map((line, i) => (
              <div key={i} className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50/50 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500">Item {i + 1}</span>
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                      className="text-xs text-red-500 hover:text-red-700"
                    >Remove</button>
                  )}
                </div>
                {/* Product picker */}
                {products.length > 0 && (
                  <select
                    className="form-select text-xs"
                    value={line.productId ?? ""}
                    onChange={(e) => fillFromProduct(i, e.target.value)}
                  >
                    <option value="">— Pick from catalog or enter manually —</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} · ₹{Number(p.salePrice).toFixed(2)}</option>
                    ))}
                  </select>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                  <div className="col-span-2 sm:col-span-3">
                    <label className="form-label text-xs">Description *</label>
                    <input
                      type="text"
                      required
                      className="form-input text-sm"
                      placeholder="Item description"
                      value={line.description}
                      onChange={(e) => updateLine(i, { description: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="form-label text-xs">HSN/SAC</label>
                    <input
                      type="text"
                      className="form-input text-sm font-mono"
                      placeholder="8517"
                      value={line.hsnCode}
                      onChange={(e) => updateLine(i, { hsnCode: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="form-label text-xs">Qty</label>
                    <input
                      type="number"
                      min={0.001}
                      step="any"
                      required
                      className="form-input text-sm"
                      value={line.quantity}
                      onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="form-label text-xs">Rate (₹)</label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      required
                      className="form-input text-sm"
                      value={line.unitPrice}
                      onChange={(e) => updateLine(i, { unitPrice: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="form-label text-xs">GST %</label>
                    <select
                      className="form-select text-sm"
                      value={line.gstRatePercent}
                      onChange={(e) => updateLine(i, { gstRatePercent: Number(e.target.value) })}
                    >
                      {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="form-label text-xs">Discount %</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className="form-input text-sm"
                      value={line.discountPercent}
                      onChange={(e) => updateLine(i, { discountPercent: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="text-right text-sm text-gray-500">
                  Taxable: <span className="font-medium text-gray-700">{formatINR(calcLine(line).taxable)}</span>
                  {" "}· GST: <span className="font-medium">{formatINR(calcLine(line).tax)}</span>
                  {" "}· Total: <span className="font-bold text-gray-900">{formatINR(calcLine(line).total)}</span>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setLines((prev) => [...prev, emptyLine()])}
              className="btn-ghost btn-sm text-brand-600"
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
              </svg>
              Add Line Item
            </button>
          </div>

          {/* Totals */}
          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
            <div className="ml-auto max-w-xs space-y-1 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Taxable Amount</span>
                <span className="inr">{formatINR(totals.taxable)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Total Tax</span>
                <span className="inr">{formatINR(totals.tax)}</span>
              </div>
              <div className="flex justify-between font-bold text-base text-gray-900 pt-2 border-t border-gray-200">
                <span>Estimated Total</span>
                <span className="inr">{formatINR(totals.total)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={() => router.back()} className="btn-secondary">Cancel</button>
          <button
            id="submit-invoice-btn"
            type="submit"
            disabled={submitting}
            className="btn-primary px-8"
          >
            {submitting ? "Saving…" : `Save & Generate ${isQuotation ? 'Quotation' : 'Invoice'}`}
          </button>
        </div>
      </form>
    </div>
  );
}
