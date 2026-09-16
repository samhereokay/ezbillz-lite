"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { SearchInput, EmptyState, TableSkeleton } from "@/components/ui/shared";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { formatINR, formatDate, GST_RATES } from "@/lib/utils";
import { useAutoSave } from "@/hooks/useAutoSave";
import { DraftRecoveryBanner } from "@/components/documents/DraftRecoveryBanner";

type Purchase = {
  id: string;
  billNumber?: string;
  billDate: string;
  grandTotal: string;
  status: string;
  supplier: { name: string };
  items: { lineTotal: string }[];
};
type Supplier = { id: string; name: string };
type Product = {
  id: string;
  name: string;
  purchasePrice?: string;
  gstRatePercent: string;
  hsnCode?: string;
  unit?: string;
};

type PurchaseItem = {
  description: string;
  hsnCode: string;
  quantity: number;
  unitCost: number;
  gstRatePercent: number;
  productId?: string;
};

function PurchaseForm({
  onSave,
  onCancel,
}: {
  onSave: (p: Purchase) => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const [supplierId, setSupplierId] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<PurchaseItem[]>([
    { description: "", hsnCode: "", quantity: 1, unitCost: 0, gstRatePercent: 18 },
  ]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([fetch("/api/suppliers"), fetch("/api/products")]).then(
      async ([sr, pr]) => {
        const [sd, pd] = await Promise.all([sr.json(), pr.json()]);
        setSuppliers(sd.suppliers ?? []);
        setProducts(pd.products ?? []);
      }
    );
  }, []);

  function updateItem(i: number, patch: Partial<PurchaseItem>) {
    setItems((p) =>
      p.map((item, idx) => (idx === i ? { ...item, ...patch } : item))
    );
  }
  function fillFromProduct(i: number, pid: string) {
    const p = products.find((x) => x.id === pid);
    if (p)
      updateItem(i, {
        productId: p.id,
        description: p.name,
        unitCost: Number(p.purchasePrice ?? 0),
        gstRatePercent: Number(p.gstRatePercent),
        hsnCode: p.hsnCode ?? "",
      });
  }

  const { status, lastSavedAt, draftId, initializeDraft, clearDraft } = useAutoSave({
    type: "PURCHASE",
    data: { supplierId, billNumber, items },
    enabled: !saving,
  });

  const handleRecover = (recoveredDraftId: string, version: number, payload: any) => {
    if (payload.supplierId) setSupplierId(payload.supplierId);
    if (payload.billNumber) setBillNumber(payload.billNumber);
    if (payload.items) setItems(payload.items);
    initializeDraft(recoveredDraftId, version);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supplierId) {
      toast("Please select a supplier", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,
          billNumber: billNumber || undefined,
          items,
          draftId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "Failed", "error");
        return;
      }
      clearDraft();
      toast("Purchase bill recorded");
      onSave(data.purchase);
    } catch {
      toast("Network error", "error");
    } finally {
      setSaving(false);
    }
  }

  const total = items.reduce(
    (s, item) =>
      s + item.quantity * item.unitCost * (1 + item.gstRatePercent / 100),
    0
  );

  return (
    <>
      <DraftRecoveryBanner type="PURCHASE" onRecover={handleRecover} />
      <form onSubmit={submit} className="space-y-4 mt-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="form-label">Supplier *</label>
            <select
              className="form-select"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              required
            >
              <option value="">— Select Supplier —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Supplier Bill No.</label>
            <input
              type="text"
              className="form-input"
              placeholder="BILL-001"
              value={billNumber}
              onChange={(e) => setBillNumber(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700">Items</h3>
            <button
              type="button"
              onClick={() =>
                setItems((p) => [
                  ...p,
                  {
                    description: "",
                    hsnCode: "",
                    quantity: 1,
                    unitCost: 0,
                    gstRatePercent: 18,
                  },
                ])
              }
              className="btn-ghost btn-sm text-brand-600"
            >
              + Add Item
            </button>
          </div>
          {items.map((item, i) => (
            <div
              key={i}
              className="border border-gray-200 rounded-xl p-3 space-y-2 bg-gray-50"
            >
              {products.length > 0 && (
                <select
                  className="form-select text-xs"
                  value={item.productId ?? ""}
                  onChange={(e) => fillFromProduct(i, e.target.value)}
                >
                  <option value="">— Pick from catalog —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <div className="col-span-2">
                  <label className="form-label text-xs">Description *</label>
                  <input
                    type="text"
                    required
                    className="form-input text-sm"
                    value={item.description}
                    onChange={(e) => updateItem(i, { description: e.target.value })}
                  />
                </div>
                <div>
                  <label className="form-label text-xs">Qty</label>
                  <input
                    type="number"
                    min={0.001}
                    step="any"
                    className="form-input text-sm"
                    value={item.quantity}
                    onChange={(e) =>
                      updateItem(i, { quantity: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <label className="form-label text-xs">Cost (₹)</label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    className="form-input text-sm"
                    value={item.unitCost}
                    onChange={(e) =>
                      updateItem(i, { unitCost: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <label className="form-label text-xs">GST%</label>
                  <select
                    className="form-select text-sm"
                    value={item.gstRatePercent}
                    onChange={(e) =>
                      updateItem(i, { gstRatePercent: Number(e.target.value) })
                    }
                  >
                    {GST_RATES.map((r) => (
                      <option key={r} value={r}>
                        {r}%
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => setItems((p) => p.filter((_, idx) => idx !== i))}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Remove item
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="text-right text-sm font-semibold text-gray-900">
          Estimated Total:{" "}
          <span className="inr text-base">{formatINR(total)}</span>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Saving…" : "Record Purchase"}
          </button>
        </div>
      </form>
    </>
  );
}

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/purchases");
      if (res.ok) {
        const d = await res.json();
        setPurchases(d.purchases ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = purchases.filter(
    (p) =>
      search === "" ||
      p.supplier.name.toLowerCase().includes(search.toLowerCase()) ||
      p.billNumber?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Purchase Bills</h1>
          <p className="text-muted">{purchases.length} bills</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="btn-primary"
          id="add-purchase-btn"
        >
          <svg
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            className="w-4 h-4"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4v16m8-8H4"
            />
          </svg>
          Record Purchase
        </button>
      </div>

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search by supplier or bill number…"
        className="max-w-xs"
      />

      <div className="card">
        {loading ? (
          <TableSkeleton rows={5} cols={5} />
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
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                />
              </svg>
            }
            title="No purchases yet"
            description="Record supplier bills to track expenses and input tax credit"
            action={
              <button
                onClick={() => setShowForm(true)}
                className="btn-primary btn-sm"
              >
                Record Purchase
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Bill No.</th>
                  <th>Supplier</th>
                  <th>Date</th>
                  <th>Items</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id}>
                    <td className="font-mono text-xs text-gray-600">
                      {p.billNumber ?? "—"}
                    </td>
                    <td className="font-medium">{p.supplier.name}</td>
                    <td className="text-xs text-gray-500">
                      {formatDate(p.billDate)}
                    </td>
                    <td className="text-gray-600">{p.items.length} items</td>
                    <td className="font-semibold inr">
                      {formatINR(Number(p.grandTotal))}
                    </td>
                    <td>
                      <span
                        className={
                          p.status === "RECORDED"
                            ? "badge-green"
                            : "badge-yellow"
                        }
                      >
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Record Purchase Bill"
        size="xl"
      >
        <PurchaseForm
          onSave={(p) => {
            setPurchases((prev) => [p, ...prev]);
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
        />
      </Modal>
    </div>
  );
}
