"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { formatINR } from "@/lib/utils";
import { useAutoSave } from "@/hooks/useAutoSave";
import { DraftRecoveryBanner } from "@/components/documents/DraftRecoveryBanner";
import { DraftStatusIndicator } from "@/components/documents/DraftStatusIndicator";

export default function NewPaymentPage() {
  const router = useRouter();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const initialInvoiceId = searchParams.get("invoiceId") || "";

  const [form, setForm] = useState({
    direction: "RECEIVED" as "RECEIVED" | "PAID",
    method: "CASH",
    amount: "",
    note: "",
    customerId: "",
    supplierId: "",
    invoiceId: initialInvoiceId,
  });

  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [invoices, setInvoices] = useState<{ id: string; number: string; grandTotal: string; amountPaid: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([fetch("/api/customers"), fetch("/api/suppliers")]).then(async ([cr, sr]) => {
      const [cd, sd] = await Promise.all([cr.json(), sr.json()]);
      setCustomers(cd.customers ?? []);
      setSuppliers(sd.suppliers ?? []);
    });
  }, []);

  useEffect(() => {
    if (form.direction === "RECEIVED" && form.customerId) {
      fetch(`/api/invoices?customerId=${form.customerId}`).then(r => r.json()).then(d => setInvoices(d.invoices ?? []));
    } else {
      setInvoices([]);
    }
  }, [form.direction, form.customerId]);

  function handleChange(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm(p => ({ ...p, [field]: e.target.value }));
    };
  }

  const { status, lastSavedAt, draftId, initializeDraft, clearDraft, reloadFromServer } = useAutoSave({
    type: "PAYMENT",
    data: form,
    enabled: !saving && !initialInvoiceId,
  });

  const handleRecover = (recoveredDraftId: string, version: number, payload: any) => {
    setForm(prev => ({ ...prev, ...payload }));
    initializeDraft(recoveredDraftId, version);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        direction: form.direction,
        method: form.method,
        amount: Number(form.amount),
        note: form.note || undefined,
      };
      if (form.direction === "RECEIVED" && form.customerId) body.customerId = form.customerId;
      if (form.direction === "PAID" && form.supplierId) body.supplierId = form.supplierId;
      if (form.invoiceId) body.invoiceId = form.invoiceId;
      if (draftId) body.draftId = draftId;

      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "Failed to record payment", "error");
        return;
      }
      clearDraft();
      toast(`Payment of ${formatINR(Number(form.amount))} recorded`);
      router.push(`/payments/${data.payment.id}`);
    } catch {
      toast("Network error", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Record Payment</h1>
        <DraftStatusIndicator status={status} lastSavedAt={lastSavedAt} onReload={reloadFromServer} />
      </div>
      <DraftRecoveryBanner type="PAYMENT" onRecover={handleRecover} />
      <form onSubmit={submit} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Type</label>
            <select
              value={form.direction}
              onChange={handleChange("direction")}
              className="w-full border border-gray-300 rounded p-2 bg-gray-50 text-sm"
              disabled={!!initialInvoiceId}
            >
              <option value="RECEIVED">Money Received (In)</option>
              <option value="PAID">Money Paid (Out)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Amount</label>
            <input
              type="number"
              step="0.01"
              required
              value={form.amount}
              onChange={handleChange("amount")}
              className="w-full border border-gray-300 rounded p-2 text-sm"
              placeholder="0.00"
            />
          </div>
        </div>

        {form.direction === "RECEIVED" ? (
          <div>
            <label className="block text-sm font-medium mb-1">Customer</label>
            <select value={form.customerId} onChange={handleChange("customerId")} className="w-full border border-gray-300 rounded p-2 text-sm">
              <option value="">Select Customer...</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium mb-1">Supplier</label>
            <select value={form.supplierId} onChange={handleChange("supplierId")} className="w-full border border-gray-300 rounded p-2 text-sm">
              <option value="">Select Supplier...</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}

        {form.direction === "RECEIVED" && (form.customerId || initialInvoiceId) && (
          <div>
            <label className="block text-sm font-medium mb-1">Link to Invoice (Optional)</label>
            {initialInvoiceId && !invoices.length ? (
              <input type="text" disabled value="Linked to pre-selected Invoice" className="w-full border border-gray-300 rounded p-2 text-sm bg-gray-50" />
            ) : (
              <select value={form.invoiceId} onChange={handleChange("invoiceId")} className="w-full border border-gray-300 rounded p-2 text-sm">
                <option value="">None</option>
                {invoices.map(i => {
                  const out = Number(i.grandTotal) - Number(i.amountPaid);
                  return (
                    <option key={i.id} value={i.id}>
                      {i.number} — Outstanding: {formatINR(out)}
                    </option>
                  );
                })}
              </select>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Payment Method</label>
            <select value={form.method} onChange={handleChange("method")} className="w-full border border-gray-300 rounded p-2 text-sm">
              <option value="CASH">Cash</option>
              <option value="UPI">UPI</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="CARD">Card</option>
              <option value="CHEQUE">Cheque</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <input
              type="text"
              value={form.note}
              onChange={handleChange("note")}
              className="w-full border border-gray-300 rounded p-2 text-sm"
              placeholder="Reference # or notes"
            />
          </div>
        </div>

        <div className="flex gap-4 pt-4 border-t border-gray-100">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !form.amount}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving ? "Recording..." : "Record Payment"}
          </button>
        </div>
      </form>
    </div>
  );
}
