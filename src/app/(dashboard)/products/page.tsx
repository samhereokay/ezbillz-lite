"use client";


import { useAutoSave } from "@/hooks/useAutoSave";
import { DraftRecoveryBanner } from "@/components/documents/DraftRecoveryBanner";
import { DraftStatusIndicator } from "@/components/documents/DraftStatusIndicator";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";



import { useState, useEffect, useCallback } from "react";
import { SearchInput, EmptyState, TableSkeleton } from "@/components/ui/shared";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { formatINR, GST_RATES } from "@/lib/utils";

type Product = { id: string; name: string; sku?: string; hsnCode?: string; salePrice: string; gstRatePercent: string; unit: string; isService: boolean; currentStock: number; lowStockThreshold?: number };

function ProductForm({ onSave, onCancel }: { onSave: (p: Product) => void; onCancel: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", sku: "", hsnCode: "", salePrice: "", purchasePrice: "", gstRatePercent: "18", unit: "PCS", isService: false, lowStockThreshold: "0" });
  const [saving, setSaving] = useState(false);

  function set(f: keyof typeof form) { return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(p => ({ ...p, [f]: e.target.value })); }

  const { status, lastSavedAt, draftId, initializeDraft, clearDraft, reloadFromServer } = useAutoSave({
    type: "PRODUCT",
    data: form,
    enabled: !saving,
  });

  const handleRecover = (recoveredDraftId: string, version: number, payload: any) => {
    setForm(prev => ({ ...prev, ...payload }));
    initializeDraft(recoveredDraftId, version);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, sku: form.sku || undefined, hsnCode: form.hsnCode || undefined, salePrice: Number(form.salePrice), purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : undefined, gstRatePercent: Number(form.gstRatePercent), unit: form.unit, isService: form.isService, lowStockThreshold: Number(form.lowStockThreshold) }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error ?? "Failed", "error"); return; }
      toast(`Product "${data.product.name}" created`);
      onSave({ ...data.product, currentStock: 0 });
    } catch { toast("Network error", "error"); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <DraftStatusIndicator status={status} lastSavedAt={lastSavedAt} onReload={reloadFromServer} />
      </div>
      <DraftRecoveryBanner type="PRODUCT" onRecover={handleRecover} />
      <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="form-label">Product / Service Name *</label>
          <input type="text" required className="form-input" placeholder="Mobile Phone" value={form.name} onChange={set("name")}/>
        </div>
        <div>
          <label className="form-label">SKU</label>
          <input type="text" className="form-input font-mono" placeholder="SKU-001" value={form.sku} onChange={set("sku")}/>
        </div>
        <div>
          <label className="form-label">HSN / SAC Code</label>
          <input type="text" className="form-input font-mono" placeholder="8517" value={form.hsnCode} onChange={set("hsnCode")}/>
        </div>
        <div>
          <label className="form-label">Sale Price (₹) *</label>
          <input type="number" required min={0} step="any" className="form-input" placeholder="1000.00" value={form.salePrice} onChange={set("salePrice")}/>
        </div>
        <div>
          <label className="form-label">Purchase Price (₹)</label>
          <input type="number" min={0} step="any" className="form-input" placeholder="800.00" value={form.purchasePrice} onChange={set("purchasePrice")}/>
        </div>
        <div>
          <label className="form-label">GST Rate *</label>
          <select className="form-select" value={form.gstRatePercent} onChange={set("gstRatePercent")} required>
            {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Unit</label>
          <select className="form-select" value={form.unit} onChange={set("unit")}>
            {["PCS", "KG", "LTR", "MTR", "BOX", "PAIR", "SET", "NOS", "SQM", "HRS"].map(u => <option key={u}>{u}</option>)}
          </select>
        </div>
        <div className="col-span-2 flex items-center gap-3">
          <input type="checkbox" id="isService" className="w-4 h-4 text-brand-600 rounded" checked={form.isService} onChange={e => setForm(p => ({ ...p, isService: e.target.checked }))}/>
          <label htmlFor="isService" className="text-sm text-gray-700">This is a Service (no stock tracking)</label>
        </div>
        {!form.isService && (
          <div>
            <label className="form-label">Low Stock Alert (qty)</label>
            <input type="number" min={0} className="form-input" value={form.lowStockThreshold} onChange={set("lowStockThreshold")}/>
          </div>
        )}
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary">{saving ? "Saving…" : "Save Product"}</button>
      </div>
    </form>
    </div>
  );
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  
  const searchParams = useSearchParams();
  const router = useRouter();
  const isNew = searchParams.get("new") === "true";
  const [showForm, setShowForm] = useState(isNew);
  
  useEffect(() => {
    if (isNew && !showForm) {
      setShowForm(true);
    }
  }, [isNew]);

  const handleCloseForm = () => {
    setShowForm(false);
    if (isNew) {
      router.replace("/products");
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await fetch("/api/products"); if (res.ok) { const d = await res.json(); setProducts(d.products ?? []); } }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = products.filter(p => search === "" || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku?.toLowerCase().includes(search.toLowerCase()) || p.hsnCode?.includes(search));

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Products & Services</h1>
          <p className="text-muted">{products.length} items</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/inventory/import" className="btn-secondary text-sm">
            Import CSV
          </Link>
          <a href="/api/export/products" download className="btn-secondary text-sm" aria-label="Export products as CSV">
            Export CSV
          </a>
          <button onClick={() => setShowForm(true)} className="btn-primary" id="add-product-btn">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
            Add Product
          </button>
        </div>
      </div>

      <SearchInput value={search} onChange={setSearch} placeholder="Search by name, SKU, HSN…" className="max-w-xs"/>

      <div className="card">
        {loading ? <TableSkeleton rows={5} cols={6}/> : filtered.length === 0 ? (
          <EmptyState
            icon={<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>}
            title="No products yet"
            description="Add your first product or service to start invoicing"
            action={<button onClick={() => setShowForm(true)} className="btn-primary btn-sm">Add Product</button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Name</th><th>SKU</th><th>HSN/SAC</th><th>Sale Price</th><th>GST%</th><th>Stock</th><th>Type</th></tr></thead>
              <tbody>
                {filtered.map(p => {
                  const isLow = !p.isService && p.currentStock <= (p.lowStockThreshold ?? 0);
                  return (
                    <tr key={p.id}>
                      <td className="font-medium">{p.name}</td>
                      <td className="font-mono text-xs text-gray-500">{p.sku ?? "—"}</td>
                      <td className="font-mono text-xs text-gray-500">{p.hsnCode ?? "—"}</td>
                      <td className="font-semibold inr">{formatINR(Number(p.salePrice))}</td>
                      <td>{Number(p.gstRatePercent)}%</td>
                      <td>
                        {p.isService ? <span className="text-gray-400 text-xs">N/A</span> : (
                          <span className={isLow ? "text-red-600 font-semibold" : "text-gray-700"}>
                            {p.currentStock} {p.unit}
                            {isLow && <span className="ml-1 text-red-500 text-[10px]">⚠ Low</span>}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={p.isService ? "badge-blue" : "badge-gray"}>
                          {p.isService ? "Service" : "Goods"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Add Product / Service" size="lg">
        <ProductForm onSave={(p) => { setProducts(prev => [p, ...prev]); setShowForm(false); }} onCancel={() => setShowForm(false)}/>
      </Modal>
    </div>
  );
}
