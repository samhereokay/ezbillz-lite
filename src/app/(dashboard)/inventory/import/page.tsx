"use client";

import { useState } from "react";
import CsvImporter from "@/components/inventory/CsvImporter";
import Link from "next/link";

export default function ImportPage() {
  const [activeTab, setActiveTab] = useState<"products" | "customers" | "suppliers">("products");

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="page-header">
        <div>
          <h1 className="page-title">Import Data</h1>
          <p className="text-muted">Bulk upload products, customers, or suppliers from CSV files.</p>
        </div>
      </div>

      <div className="card">
        <div className="border-b border-gray-100 flex overflow-x-auto hide-scrollbar">
          {(["products", "customers", "suppliers"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab
                  ? "border-brand-500 text-brand-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div className="p-6 md:p-8">
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Import {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
            </h2>
            <p className="text-sm text-gray-500">
              {activeTab === "products" && "Upload your product catalog. SKUs must be unique. Duplicate SKUs will be rejected."}
              {activeTab === "customers" && "Upload your customer list. You can map existing data to EzBillz format."}
              {activeTab === "suppliers" && "Upload your supplier list. You can map existing data to EzBillz format."}
            </p>
          </div>

          <CsvImporter
            entity={activeTab}
            onSuccess={(count) => {
              console.log(`Successfully imported ${count} ${activeTab}`);
            }}
          />
        </div>
      </div>

      {/* Helper text */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 text-sm text-blue-800">
        <h3 className="font-semibold flex items-center gap-2 mb-2">
          <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Import Guidelines
        </h3>
        <ul className="list-disc pl-7 space-y-1 text-blue-700">
          <li>Always use the provided CSV template to ensure column headers match exactly.</li>
          <li>Files are limited to 5MB maximum size.</li>
          <li>If any row fails validation, the entire file will be rejected (no partial imports).</li>
          <li>Data is imported into your current organization context only.</li>
        </ul>
      </div>
    </div>
  );
}
