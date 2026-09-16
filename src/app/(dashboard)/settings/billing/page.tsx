"use client";

import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/shared";
import Link from "next/link";
import { SubscriptionDetails } from "@/server/subscription";

export default function BillingPage() {
  const [subData, setSubData] = useState<SubscriptionDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/subscription", { cache: "no-store" })
      .then(r => r.json())
      .then(d => {
        if (d.subscription) setSubData(d.subscription);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-semibold text-gray-900">Billing & Plan</h1>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  const { subscription, status, trialDaysRemaining, canCreateTransaction } = subData || {};

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Billing & Plan</h1>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-1">Current Plan</h2>
          
          <div className="mt-4 flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {subscription?.plan === "FREE_TRIAL" ? "Free Trial" : subscription?.plan}
              </p>
              
              <div className="mt-1 text-sm text-gray-500">
                {status === "TRIAL_ACTIVE" && (
                  <p className="text-amber-600 font-medium">Your trial expires in {trialDaysRemaining} days.</p>
                )}
                {status === "TRIAL_EXPIRED" && (
                  <p className="text-red-600 font-medium">Your free trial has expired.</p>
                )}
                {(status === "LITE_ACTIVE" || status === "BUSINESS_ACTIVE") && (
                  <p className="text-green-600 font-medium">Your subscription is active.</p>
                )}
                {status === "SUBSCRIPTION_EXPIRED" && (
                  <p className="text-red-600 font-medium">Your subscription has expired or is past due.</p>
                )}
              </div>
            </div>

            <Link href="/pricing" className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
              Upgrade Plan
            </Link>
          </div>
        </div>
        
        {!canCreateTransaction && (
          <div className="bg-red-50 p-4 border-t border-red-100">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Action Required</h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>You cannot create new invoices or purchases until you upgrade your plan. You still have read-only access to your existing data.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}