"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ui/toast";
import { INDIAN_STATES } from "@/lib/utils";
import { Skeleton } from "@/components/ui/shared";

type OrgData = {
  id: string; name: string; legalName?: string; gstin?: string; state: string; stateCode: string;
  addressLine1?: string; addressLine2?: string; city?: string; pincode?: string;
  invoicePrefix: string; invoiceNextSeq: number;
};

export default function SettingsPage() {
  const { toast } = useToast();
  const [org, setOrg] = useState<OrgData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", legalName: "", gstin: "", state: "", stateCode: "", addressLine1: "", city: "", pincode: "", invoicePrefix: "" });

  useEffect(() => {
    fetch("/api/org/me").then(r => r.json()).then(d => {
      setOrg(d.org);
      if (d.org) {
        setForm({ name: d.org.name, legalName: d.org.legalName ?? "", gstin: d.org.gstin ?? "", state: d.org.state, stateCode: d.org.stateCode, addressLine1: d.org.addressLine1 ?? "", city: d.org.city ?? "", pincode: d.org.pincode ?? "", invoicePrefix: d.org.invoicePrefix });
      }
    }).finally(() => setLoading(false));
  }, []);

  function set(f: keyof typeof form) { return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(p => ({ ...p, [f]: e.target.value })); }
  function onStateChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const s = INDIAN_STATES.find(x => x.name === e.target.value);
    if (s) setForm(p => ({ ...p, state: s.name, stateCode: s.code }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      const res = await fetch("/api/org/me", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, legalName: form.legalName || undefined, gstin: form.gstin || undefined, state: form.state, stateCode: form.stateCode, addressLine1: form.addressLine1 || undefined, city: form.city || undefined, pincode: form.pincode || undefined, invoicePrefix: form.invoicePrefix }),
      });
      if (res.ok) { toast("Settings saved"); setOrg(await res.json().then(d => d.org)); }
      else { const d = await res.json(); toast(d.error ?? "Save failed", "error"); }
    } catch { toast("Network error", "error"); }
    finally { setSaving(false); }
  }

  if (loading) return (
    <div className="max-w-2xl space-y-4">
      <Skeleton className="h-8 w-32"/>
      <div className="card p-6 space-y-3">{Array.from({length:8}).map((_, i) => <Skeleton key={i} className="h-10 w-full"/>)}</div>
    </div>
  );

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="page-title">Business Settings</h1>

      <form onSubmit={save} className="space-y-6">
        {/* Business profile */}
        <div className="card">
          <div className="card-header"><h2 className="text-sm font-semibold">Business Profile</h2></div>
          <div className="card-body grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="form-label">Business Name *</label>
              <input type="text" required className="form-input" value={form.name} onChange={set("name")}/>
            </div>
            <div className="col-span-2">
              <label className="form-label">Legal Name</label>
              <input type="text" className="form-input" placeholder="As registered with GST" value={form.legalName} onChange={set("legalName")}/>
            </div>
            <div>
              <label className="form-label">State *</label>
              <select className="form-select" value={form.state} onChange={onStateChange} required>
                {INDIAN_STATES.map(s => <option key={s.code} value={s.name}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">State Code</label>
              <input type="text" readOnly className="form-input bg-gray-50" value={form.stateCode}/>
            </div>
            <div className="col-span-2">
              <label className="form-label">Address</label>
              <input type="text" className="form-input" placeholder="Street address" value={form.addressLine1} onChange={set("addressLine1")}/>
            </div>
            <div>
              <label className="form-label">City</label>
              <input type="text" className="form-input" value={form.city} onChange={set("city")}/>
            </div>
            <div>
              <label className="form-label">PIN Code</label>
              <input type="text" maxLength={6} className="form-input" value={form.pincode} onChange={set("pincode")}/>
            </div>
          </div>
        </div>

        {/* GST */}
        <div className="card">
          <div className="card-header"><h2 className="text-sm font-semibold">GST Details</h2></div>
          <div className="card-body">
            <label className="form-label">GSTIN</label>
            <input type="text" maxLength={15} className="form-input font-mono max-w-xs" placeholder="29XXXXX0000X1ZX" value={form.gstin} onChange={set("gstin")}/>
            {form.gstin && form.gstin.length !== 15 && <p className="form-error">GSTIN must be exactly 15 characters</p>}
          </div>
        </div>

        {/* Invoice numbering */}
        <div className="card">
          <div className="card-header"><h2 className="text-sm font-semibold">Invoice Numbering</h2></div>
          <div className="card-body space-y-3">
            <div>
              <label className="form-label">Invoice Prefix</label>
              <div className="flex items-center gap-2">
                <input type="text" className="form-input max-w-xs font-mono" placeholder="INV" value={form.invoicePrefix} onChange={set("invoicePrefix")}/>
                <span className="text-sm text-gray-500">→ next: {form.invoicePrefix}-{String(org?.invoiceNextSeq ?? 1).padStart(5, "0")}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="btn-primary px-8">
            {saving ? "Saving…" : "Save Settings"}
          </button>
        </div>
      </form>
    </div>
  );
}
