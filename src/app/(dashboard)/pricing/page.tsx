"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ui/toast";
import { PricingTier } from "@/server/catalog";
import { Skeleton } from "@/components/ui/shared";

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);
  const [plans, setPlans] = useState<PricingTier[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetch("/api/subscription")
      .then((res) => res.json())
      .then((data) => {
        if (data.catalog) {
          setPlans(data.catalog);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleUpgrade = (plan: string) => {
    toast(`Payment integration for the ${plan} plan is under development. Contact sales for early access.`);
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto py-12 px-4 text-center">
        <Skeleton className="h-10 w-1/3 mx-auto mb-10" />
        <Skeleton className="h-64 w-full max-w-4xl mx-auto" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <div className="text-center">
        <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
          Simple, transparent pricing
        </h2>
        <p className="mt-4 text-xl text-gray-500">
          No hidden fees. No surprise charges.
        </p>
      </div>

      <div className="mt-12 flex justify-center">
        <div className="relative flex items-center p-1 bg-gray-100 rounded-full">
          <button
            onClick={() => setAnnual(false)}
            className={`${
              !annual ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-900"
            } relative w-1/2 rounded-full py-2 px-8 text-sm font-medium whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-blue-500 focus:z-10 sm:w-auto sm:px-10`}
          >
            Monthly billing
          </button>
          <button
            onClick={() => setAnnual(true)}
            className={`${
              annual ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-900"
            } relative w-1/2 rounded-full py-2 px-8 text-sm font-medium whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-blue-500 focus:z-10 sm:w-auto sm:px-10`}
          >
            Annual billing
          </button>
        </div>
      </div>

      <div className="mt-12 space-y-4 sm:mt-16 sm:space-y-0 sm:grid sm:grid-cols-2 sm:gap-6 lg:max-w-4xl lg:mx-auto xl:max-w-none xl:mx-0 xl:grid-cols-2">
        {plans.map((plan) => (
          <div key={plan.name} className="border border-gray-200 rounded-lg shadow-sm divide-y divide-gray-200 bg-white">
            <div className="p-6">
              <h2 className="text-2xl leading-6 font-semibold text-gray-900">{plan.name}</h2>
              <p className="mt-8">
                <span className="text-4xl font-extrabold text-gray-900">
                  ₹{annual ? plan.annual : plan.monthly}
                </span>
                <span className="text-base font-medium text-gray-500">
                  /{annual ? "yr" : "mo"}
                </span>
              </p>
              <button
                onClick={() => handleUpgrade(plan.name)}
                className="mt-8 block w-full bg-blue-600 border border-transparent rounded-md py-2 text-sm font-semibold text-white text-center hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Upgrade to {plan.name}
              </button>
            </div>
            <div className="pt-6 pb-8 px-6">
              <h3 className="text-xs font-medium text-gray-900 tracking-wide uppercase">
                What's included
              </h3>
              <ul className="mt-6 space-y-4">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex space-x-3">
                    <svg className="flex-shrink-0 h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm text-gray-500">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}