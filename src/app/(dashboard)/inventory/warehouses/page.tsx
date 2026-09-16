"use client";

import { useState, useEffect, useCallback } from "react";
import { Skeleton, EmptyState } from "@/components/ui/shared";
import { useToast } from "@/components/ui/toast";
import { Modal } from "@/components/ui/modal";
import { formatDate } from "@/lib/utils";

type Location = {
  id: string;
  name: string;
  isActive: boolean;
};

type Warehouse = {
  id: string;
  name: string;
  isActive: boolean;
  isDefault: boolean;
  locations: Location[];
  createdAt: string;
};

export default function WarehousesPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [showWarehouseForm, setShowWarehouseForm] = useState(false);
  const [showLocationForm, setShowLocationForm] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(null);
  
  const [name, setName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [isActive, setIsActive] = useState(true);

  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/inventory/warehouses");
      if (!res.ok) throw new Error("Failed to load warehouses");
      const json = await res.json();
      setWarehouses(json.warehouses);
    } catch {
      toast("Failed to load warehouses", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const openNewWarehouse = () => {
    setEditingWarehouse(null);
    setName("");
    setIsDefault(warehouses.length === 0);
    setIsActive(true);
    setShowWarehouseForm(true);
  };

  const openEditWarehouse = (wh: Warehouse) => {
    setEditingWarehouse(wh);
    setName(wh.name);
    setIsDefault(wh.isDefault);
    setIsActive(wh.isActive);
    setShowWarehouseForm(true);
  };

  const openNewLocation = (warehouseId: string) => {
    setSelectedWarehouseId(warehouseId);
    setName("");
    setIsActive(true);
    setShowLocationForm(true);
  };

  const handleSaveWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    try {
      const url = editingWarehouse ? `/api/inventory/warehouses/${editingWarehouse.id}` : "/api/inventory/warehouses";
      const method = editingWarehouse ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, isDefault, isActive }),
      });
      
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save warehouse");
      
      toast(editingWarehouse ? "Warehouse updated" : "Warehouse created", "success");
      setShowWarehouseForm(false);
      load();
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !selectedWarehouseId) return;

    setSaving(true);
    try {
      const res = await fetch("/api/inventory/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, warehouseId: selectedWarehouseId }),
      });
      
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save location");
      
      toast("Location created", "success");
      setShowLocationForm(false);
      load();
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Warehouses</h1>
          <p className="text-muted">Manage storage locations for your inventory</p>
        </div>
        <button onClick={openNewWarehouse} className="btn-primary">
          + Add Warehouse
        </button>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}
        </div>
      ) : warehouses.length === 0 ? (
        <EmptyState
          icon={<svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>}
          title="No warehouses found"
          description="Create your first warehouse to track inventory."
          action={<button onClick={openNewWarehouse} className="btn-primary">Add Warehouse</button>}
        />
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {warehouses.map(wh => (
            <div key={wh.id} className={`card overflow-hidden flex flex-col ${!wh.isActive ? "opacity-75 bg-gray-50/50" : ""}`}>
              <div className="p-5 border-b border-gray-100 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900 truncate" title={wh.name}>{wh.name}</h3>
                    {wh.isDefault && <span className="badge badge-blue text-[10px] px-1.5 py-0">Default</span>}
                    {!wh.isActive && <span className="badge badge-gray text-[10px] px-1.5 py-0">Archived</span>}
                  </div>
                  <p className="text-xs text-gray-500">Created {formatDate(wh.createdAt)}</p>
                </div>
                <button
                  onClick={() => openEditWarehouse(wh)}
                  className="text-gray-400 hover:text-brand-600 transition-colors p-1"
                  aria-label="Edit warehouse"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              </div>
              
              <div className="p-4 flex-1 bg-gray-50/30">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider">Locations ({wh.locations.length})</h4>
                  {wh.isActive && (
                    <button
                      onClick={() => openNewLocation(wh.id)}
                      className="text-xs font-medium text-brand-600 hover:underline"
                    >
                      + Add
                    </button>
                  )}
                </div>
                
                {wh.locations.length > 0 ? (
                  <ul className="space-y-2">
                    {wh.locations.map(loc => (
                      <li key={loc.id} className="flex items-center gap-2 text-sm text-gray-700 bg-white p-2 rounded-lg border border-gray-100 shadow-sm">
                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span className="truncate flex-1">{loc.name}</span>
                        {!loc.isActive && <span className="text-[10px] text-gray-400 font-medium">Inactive</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-sm text-gray-500 italic text-center py-4">No specific locations</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Warehouse Form Modal */}
      {showWarehouseForm && (
        <Modal open={showWarehouseForm} onClose={() => setShowWarehouseForm(false)} title={editingWarehouse ? "Edit Warehouse" : "Add Warehouse"}>
          <form onSubmit={handleSaveWarehouse}>
            <div className="p-6 space-y-4">
              <div>
                <label className="form-label" htmlFor="wh-name">Warehouse Name <span className="text-red-500">*</span></label>
                <input
                  id="wh-name"
                  type="text"
                  required
                  maxLength={100}
                  className="form-input"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Main Warehouse"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={e => setIsDefault(e.target.checked)}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                Set as Default Warehouse
              </label>
              {editingWarehouse && (
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={e => setIsActive(e.target.checked)}
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  Active (Uncheck to archive)
                </label>
              )}
            </div>
            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3 rounded-b-xl">
              <button type="button" onClick={() => setShowWarehouseForm(false)} className="btn-secondary" disabled={saving}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving || !name.trim()}>
                {saving ? "Saving..." : "Save Warehouse"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Location Form Modal */}
      {showLocationForm && (
        <Modal open={showLocationForm} onClose={() => setShowLocationForm(false)} title="Add Location">
          <form onSubmit={handleSaveLocation}>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-500 mb-4">
                Add a specific zone, aisle, or bin to help organize stock within this warehouse.
              </p>
              <div>
                <label className="form-label" htmlFor="loc-name">Location Name <span className="text-red-500">*</span></label>
                <input
                  id="loc-name"
                  type="text"
                  required
                  maxLength={100}
                  className="form-input"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Aisle 4, Shelf B"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3 rounded-b-xl">
              <button type="button" onClick={() => setShowLocationForm(false)} className="btn-secondary" disabled={saving}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving || !name.trim()}>
                {saving ? "Saving..." : "Save Location"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
