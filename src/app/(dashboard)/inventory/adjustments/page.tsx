"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useToast } from "@/components/ui/toast";
import { Skeleton } from "@/components/ui/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Product = { id: string; name: string; sku?: string; currentStock: number; unit: string };
type Warehouse = { id: string; name: string; locations: { id: string; name: string }[] };

// Generates a client-side idempotency key for the session
const generateIdempotencyKey = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

export default function StockAdjustmentsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  // Form state
  const [productId, setProductId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [adjustmentType, setAdjustmentType] = useState<"ADD" | "SUBTRACT">("ADD");
  const [quantityStr, setQuantityStr] = useState("");
  const [note, setNote] = useState("");
  
  // We attach a fresh idempotency key on mount and refresh it after every successful save
  const [idempotencyKey, setIdempotencyKey] = useState("");

  const loadData = useCallback(async () => {
    try {
      const [prodRes, whRes] = await Promise.all([
        fetch("/api/products"),
        fetch("/api/inventory/warehouses"),
      ]);
      if (!prodRes.ok || !whRes.ok) throw new Error("Failed to load initial data");
      
      const prodJson = await prodRes.json();
      const whJson = await whRes.json();
      
      setProducts(prodJson.products);
      setWarehouses(whJson.warehouses);
      
      if (whJson.warehouses.length > 0) {
        const defaultWh = whJson.warehouses.find((w: Warehouse) => (w as any).isDefault) || whJson.warehouses[0];
        setWarehouseId(defaultWh.id);
      }
    } catch {
      toast("Failed to load data for adjustment", "error");
    } finally {
      setLoading(false);
      setIdempotencyKey(generateIdempotencyKey());
    }
  }, [toast]);

  useEffect(() => { loadData(); }, [loadData]);

  const selectedWarehouse = useMemo(() => warehouses.find(w => w.id === warehouseId), [warehouses, warehouseId]);
  const selectedProduct = useMemo(() => products.find(p => p.id === productId), [products, productId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId || !warehouseId || !quantityStr || !idempotencyKey) return;
    
    const qty = parseFloat(quantityStr);
    if (isNaN(qty) || qty <= 0) {
      toast("Quantity must be greater than zero", "error");
      return;
    }

    const finalQuantity = adjustmentType === "ADD" ? qty : -qty;

    setSaving(true);
    try {
      const res = await fetch("/api/inventory/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          warehouseId,
          locationId: locationId || undefined,
          quantity: finalQuantity,
          note,
          idempotencyKey,
        }),
      });

      const json = await res.json();
      
      if (!res.ok) {
        throw new Error(json.error || "Adjustment failed");
      }

      toast(`Successfully adjusted stock by ${finalQuantity > 0 ? '+' : ''}${finalQuantity}`, "success");
      
      // Reset form but keep selected warehouse/product for rapid entry
      setQuantityStr("");
      setNote("");
      setIdempotencyKey(generateIdempotencyKey());
      
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="page-header">
        <div>
          <h1 className="page-title">Adjust Stock</h1>
          <p className="text-muted">Manually record stock additions or reductions</p>
        </div>
        <Link href="/inventory/ledger" className="btn-secondary text-sm">
          View Ledger
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="card overflow-hidden">
        <div className="p-6 md:p-8 space-y-6">
          {/* Product Selection */}
          <div>
            <label className="form-label" htmlFor="product">
              Product <span className="text-red-500">*</span>
            </label>
            <select
              id="product"
              required
              className="form-select"
              value={productId}
              onChange={e => setProductId(e.target.value)}
            >
              <option value="" disabled>Select a product...</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.sku ? `(${p.sku})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Warehouse Selection */}
            <div>
              <label className="form-label" htmlFor="warehouse">
                Warehouse <span className="text-red-500">*</span>
              </label>
              <select
                id="warehouse"
                required
                className="form-select"
                value={warehouseId}
                onChange={e => {
                  setWarehouseId(e.target.value);
                  setLocationId("");
                }}
              >
                <option value="" disabled>Select a warehouse...</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>

            {/* Location Selection (optional) */}
            <div>
              <label className="form-label" htmlFor="location">
                Location (Optional)
              </label>
              <select
                id="location"
                className="form-select"
                value={locationId}
                onChange={e => setLocationId(e.target.value)}
                disabled={!selectedWarehouse || selectedWarehouse.locations.length === 0}
              >
                <option value="">No specific location</option>
                {selectedWarehouse?.locations.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
              {selectedWarehouse && selectedWarehouse.locations.length === 0 && (
                <p className="text-xs text-gray-400 mt-1">No locations in this warehouse</p>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100">
            <label className="form-label block mb-3">Adjustment Type</label>
            <div className="grid grid-cols-2 gap-3">
              <label className={`
                flex items-center justify-center p-3 border-2 rounded-xl cursor-pointer transition-all
                ${adjustmentType === "ADD" 
                  ? "border-green-500 bg-green-50 text-green-800" 
                  : "border-gray-200 hover:border-green-200 text-gray-600"}
              `}>
                <input 
                  type="radio" 
                  name="adjustmentType" 
                  className="sr-only"
                  checked={adjustmentType === "ADD"}
                  onChange={() => setAdjustmentType("ADD")}
                />
                <span className="font-medium flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Stock
                </span>
              </label>
              <label className={`
                flex items-center justify-center p-3 border-2 rounded-xl cursor-pointer transition-all
                ${adjustmentType === "SUBTRACT" 
                  ? "border-red-500 bg-red-50 text-red-800" 
                  : "border-gray-200 hover:border-red-200 text-gray-600"}
              `}>
                <input 
                  type="radio" 
                  name="adjustmentType" 
                  className="sr-only"
                  checked={adjustmentType === "SUBTRACT"}
                  onChange={() => setAdjustmentType("SUBTRACT")}
                />
                <span className="font-medium flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                  </svg>
                  Subtract Stock
                </span>
              </label>
            </div>
          </div>

          <div>
            <label className="form-label" htmlFor="quantity">
              Quantity <span className="text-red-500">*</span>
            </label>
            <div className="relative flex items-center">
              <input
                id="quantity"
                type="number"
                min="0.001"
                step="0.001"
                required
                className={`form-input pl-8 ${adjustmentType === "ADD" ? "text-green-700" : "text-red-700"} font-mono font-bold text-lg`}
                value={quantityStr}
                onChange={e => setQuantityStr(e.target.value)}
                placeholder="0.00"
              />
              <span className={`absolute left-3 font-bold ${adjustmentType === "ADD" ? "text-green-600" : "text-red-600"}`}>
                {adjustmentType === "ADD" ? "+" : "-"}
              </span>
              {selectedProduct && (
                <span className="absolute right-3 text-gray-400 text-sm">{selectedProduct.unit}</span>
              )}
            </div>
            {selectedProduct && (
              <p className="mt-2 text-sm text-gray-500">
                Current total stock: <span className="font-mono font-medium text-gray-700">{selectedProduct.currentStock} {selectedProduct.unit}</span>
              </p>
            )}
          </div>

          <div>
            <label className="form-label" htmlFor="note">
              Reason / Note
            </label>
            <input
              id="note"
              type="text"
              maxLength={200}
              className="form-input"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Damage, Audit correction, Opening stock"
            />
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t flex justify-end gap-3">
          <button type="button" onClick={() => router.back()} className="btn-secondary" disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving || !productId || !warehouseId || !quantityStr}>
            {saving ? "Saving..." : "Record Adjustment"}
          </button>
        </div>
      </form>
    </div>
  );
}
