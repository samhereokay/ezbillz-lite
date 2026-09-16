"use client";

import { useState, useEffect, useCallback } from "react";
import { SearchInput, EmptyState, TableSkeleton } from "@/components/ui/shared";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { INDIAN_STATES } from "@/lib/utils";
import { useAutoSave } from "@/hooks/useAutoSave";
import { DraftRecoveryBanner } from "@/components/documents/DraftRecoveryBanner";
import { DraftStatusIndicator } from "@/components/documents/DraftStatusIndicator";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

type Supplier = { id: string; name: string; gstin?: string; phone?: string; email?: string; state?: string; city?: string };

function SupplierForm({ onSave, onCancel }: { onSave: (s: Supplier) => void; onCancel: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", gstin: "", phone: "", email: "", state: "West Bengal", stateCode: "19", city: "", addressLine1: "" });
  const [saving, setSaving] = useState(false);

  function set(f: keyof typeof form) { return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(p => ({ ...p, [f]: e.target.value })); }
  function onStateChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const s = INDIAN_STATES.find(x => x.name === e.target.value);
    if (s) setForm(p => ({ ...p, state: s.name, stateCode: s.code }));
  }

  const { status, lastSavedAt, draftId, initializeDraft, clearDraft } = useAutoSave({
    type: "SUPPLIER",
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
      const res = await fetch("/api/suppliers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.name, gstin: form.gstin || undefined, phone: form.phone || undefined, email: form.email || undefined, state: form.state, stateCode: form.stateCode, city: form.city || undefined, addressLine1: form.addressLine1 || undefined }) });
      const data = await res.json();
      if (!res.ok) { toast(data.error ?? "Failed", "error"); return; }
      toast(`Supplier "${data.supplier.name}" created`);
      onSave(data.supplier);
    } catch { toast("Network error", "error"); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <DraftStatusIndicator status={status} lastSavedAt={lastSavedAt} />
      </div>
      <DraftRecoveryBanner type="SUPPLIER" onRecover={handleRecover} />
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="form-label">Supplier Name *</label>
          <input type="text" required className="form-input" placeholder="ABC Wholesalers" value={form.name} onChange={set("name")}/>
        </div>
        <div>
          <label className="form-label">GSTIN</label>
          <input type="text" maxLength={15} className="form-input font-mono" placeholder="29XXXXX0000X1ZX" value={form.gstin} onChange={set("gstin")}/>
        </div>
        <div>
          <label className="form-label">Phone</label>
          <input type="tel" className="form-input" value={form.phone} onChange={set("phone")}/>
        </div>
        <div className="col-span-2">
          <label className="form-label">Email</label>
          <input type="email" className="form-input" value={form.email} onChange={set("email")}/>
        </div>
        <div>
          <label className="form-label">State</label>
          <select className="form-select" value={form.state} onChange={onStateChange}>
            {INDIAN_STATES.map(s => <option key={s.code} value={s.name}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">City</label>
          <input type="text" className="form-input" value={form.city} onChange={set("city")}/>
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary">{saving ? "Saving…" : "Save Supplier"}</button>
      </div>
      </form>
    </div>
  );
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
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
      router.replace("/suppliers");
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await fetch("/api/suppliers"); if (res.ok) { const d = await res.json(); setSuppliers(d.suppliers ?? []); } }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = suppliers.filter(s => search === "" || s.name.toLowerCase().includes(search.toLowerCase()) || s.gstin?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Suppliers</h1>
          <p className="text-muted">{suppliers.length} total</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/inventory/import" className="btn-secondary text-sm">
            Import CSV
          </Link>
          <a href="/api/export/suppliers" download className="btn-secondary text-sm" aria-label="Export suppliers as CSV">
            Export CSV
          </a>
          <button onClick={() => setShowForm(true)} className="btn-primary" id="add-supplier-btn">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
            Add Supplier
          </button>
        </div>
      </div>

      <SearchInput value={search} onChange={setSearch} placeholder="Search by name or GSTIN…" className="max-w-xs"/>

      <div className="card">
        {loading ? <TableSkeleton rows={5} cols={5}/> : filtered.length === 0 ? (
          <EmptyState
            icon={<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414A1 1 0 0120 8.414V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"/></svg>}
            title="No suppliers yet" description="Add suppliers to track purchases"
            action={<button onClick={() => setShowForm(true)} className="btn-primary btn-sm">Add Supplier</button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Name</th><th>GSTIN</th><th>Phone</th><th>Email</th><th>State</th></tr></thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id}>
                    <td className="font-medium">{s.name}</td>
                    <td className="font-mono text-xs text-gray-500">{s.gstin ?? "—"}</td>
                    <td className="text-gray-600">{s.phone ?? "—"}</td>
                    <td className="text-gray-600">{s.email ?? "—"}</td>
                    <td className="text-gray-500">{s.state ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Add Supplier">
        <SupplierForm onSave={(s) => { setSuppliers(prev => [s, ...prev]); setShowForm(false); }} onCancel={() => setShowForm(false)}/>
      </Modal>
    </div>
  );
}
