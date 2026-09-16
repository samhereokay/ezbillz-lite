"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { SearchInput, EmptyState, TableSkeleton } from "@/components/ui/shared";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { INDIAN_STATES } from "@/lib/utils";
import { useAutoSave } from "@/hooks/useAutoSave";
import { DraftRecoveryBanner } from "@/components/documents/DraftRecoveryBanner";
import { DraftStatusIndicator } from "@/components/documents/DraftStatusIndicator";
import { useSearchParams, useRouter } from "next/navigation";

type Customer = {
  id: string; name: string; gstin?: string; phone?: string; email?: string;
  state?: string; city?: string; openingBalance: string; createdAt: string;
};

function CustomerForm({ onSave, onCancel }: { onSave: (c: Customer) => void; onCancel: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", gstin: "", phone: "", email: "", state: "West Bengal", stateCode: "19", city: "", addressLine1: "", pincode: "" });
  const [saving, setSaving] = useState(false);

  function set(f: keyof typeof form) { return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(p => ({ ...p, [f]: e.target.value })); }
  function onStateChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const s = INDIAN_STATES.find(x => x.name === e.target.value);
    if (s) setForm(p => ({ ...p, state: s.name, stateCode: s.code }));
  }

  const { status, lastSavedAt, draftId, initializeDraft, clearDraft } = useAutoSave({
    type: "CUSTOMER",
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
      const res = await fetch("/api/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.name, gstin: form.gstin || undefined, phone: form.phone || undefined, email: form.email || undefined, state: form.state, stateCode: form.stateCode, city: form.city || undefined, addressLine1: form.addressLine1 || undefined, pincode: form.pincode || undefined, draftId }) });
      const data = await res.json();
      if (!res.ok) { toast(data.error ?? "Failed to create customer", "error"); return; }
      clearDraft();
      toast(`Customer "${data.customer.name}" created`);
      onSave(data.customer);
    } catch { toast("Network error", "error"); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <DraftStatusIndicator status={status} lastSavedAt={lastSavedAt} />
      </div>
      <DraftRecoveryBanner type="CUSTOMER" onRecover={handleRecover} />
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="form-label">Customer Name *</label>
          <input type="text" required className="form-input" placeholder="Sharma Enterprises" value={form.name} onChange={set("name")}/>
        </div>
        <div>
          <label className="form-label">GSTIN</label>
          <input type="text" maxLength={15} className="form-input font-mono" placeholder="29XXXXX0000X1ZX" value={form.gstin} onChange={set("gstin")}/>
        </div>
        <div>
          <label className="form-label">Phone</label>
          <input type="tel" className="form-input" placeholder="+91 98765 43210" value={form.phone} onChange={set("phone")}/>
        </div>
        <div className="col-span-2">
          <label className="form-label">Email</label>
          <input type="email" className="form-input" placeholder="contact@business.com" value={form.email} onChange={set("email")}/>
        </div>
        <div>
          <label className="form-label">State *</label>
          <select className="form-select" value={form.state} onChange={onStateChange} required>
            {INDIAN_STATES.map(s => <option key={s.code} value={s.name}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">City</label>
          <input type="text" className="form-input" placeholder="Kolkata" value={form.city} onChange={set("city")}/>
        </div>
        <div className="col-span-2">
          <label className="form-label">Address</label>
          <input type="text" className="form-input" placeholder="123 Main Street" value={form.addressLine1} onChange={set("addressLine1")}/>
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary">{saving ? "Saving…" : "Save Customer"}</button>
      </div>
      </form>
    </div>
  );
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
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
      router.replace("/customers");
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await fetch("/api/customers"); if (res.ok) { const d = await res.json(); setCustomers(d.customers ?? []); } }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = customers.filter(c => search === "" || c.name.toLowerCase().includes(search.toLowerCase()) || c.gstin?.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search));

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="text-muted">{customers.length} total</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/inventory/import" className="btn-secondary text-sm">
            Import CSV
          </Link>
          <a href="/api/export/customers" download className="btn-secondary text-sm" aria-label="Export customers as CSV">
            Export CSV
          </a>
          <button onClick={() => setShowForm(true)} className="btn-primary" id="add-customer-btn">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
            Add Customer
          </button>
        </div>
      </div>

      <div className="flex gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by name, GSTIN, phone…" className="max-w-xs"/>
      </div>

      <div className="card">
        {loading ? <TableSkeleton rows={5} cols={5}/> : filtered.length === 0 ? (
          <EmptyState
            icon={<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.768-.231-1.48-.356-2M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.768.231-1.48.356-2m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>}
            title="No customers yet"
            description="Add your first customer to start creating invoices"
            action={<button onClick={() => setShowForm(true)} className="btn-primary btn-sm">Add Customer</button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Name</th><th>GSTIN</th><th>Phone</th><th>Email</th><th>State</th><th></th></tr></thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id}>
                    <td className="font-medium">{c.name}</td>
                    <td className="font-mono text-xs text-gray-500">{c.gstin ?? "—"}</td>
                    <td className="text-gray-600">{c.phone ?? "—"}</td>
                    <td className="text-gray-600">{c.email ?? "—"}</td>
                    <td className="text-gray-500">{c.state ?? "—"}</td>
                    <td>
                      <Link href={`/invoices/new`} className="text-xs text-brand-600 hover:text-brand-700 font-medium whitespace-nowrap">
                        Invoice →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={showForm} onClose={handleCloseForm} title="Add Customer">
        <CustomerForm onSave={(c) => { setCustomers(p => [c, ...p]); handleCloseForm(); }} onCancel={handleCloseForm}/>
      </Modal>
    </div>
  );
}
