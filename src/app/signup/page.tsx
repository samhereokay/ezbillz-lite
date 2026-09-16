"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { INDIAN_STATES } from "@/lib/utils";

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "", email: "", password: "", confirmPassword: "",
    businessName: "", gstin: "", state: "West Bengal", stateCode: "19",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  function onStateChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const state = INDIAN_STATES.find((s) => s.name === e.target.value);
    if (state) setForm((prev) => ({ ...prev, state: state.name, stateCode: state.code }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (form.password.length < 10) {
      setError("Password must be at least 10 characters");
      return;
    }
    if (form.gstin && form.gstin.length !== 15) {
      setError("GSTIN must be exactly 15 characters");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          businessName: form.businessName,
          state: form.state,
          stateCode: form.stateCode,
          gstin: form.gstin || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create account");
        return;
      }
      // Auto sign-in after registration
      const signInRes = await signIn("credentials", { email: form.email, password: form.password, redirect: false });
      if (signInRes?.ok) {
        router.refresh();
        router.push("/dashboard");
      } else {
        router.push("/login");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex items-center gap-3 justify-center mb-8">
          <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center shadow-lg shadow-brand-200">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5 text-white">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
              <polyline points="9,22 9,12 15,12 15,22" stroke="currentColor" strokeWidth={1.8}/>
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 leading-none">EZBILLZ</h1>
            <p className="text-xs text-gray-500">Billing & GST</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-xl shadow-gray-100 p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Create your account</h2>
          <p className="text-sm text-gray-500 mb-6">Set up your business on EZBILLZ in seconds</p>

          <form onSubmit={handleSubmit} className="space-y-4" id="signup-form">
            {/* Business details */}
            <div className="space-y-4">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Business Details</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label htmlFor="businessName" className="form-label">Business Name *</label>
                  <input id="businessName" type="text" required className="form-input" placeholder="Sharma Traders Pvt Ltd"
                    value={form.businessName} onChange={set("businessName")}/>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label htmlFor="state" className="form-label">State *</label>
                  <select id="state" className="form-select" value={form.state} onChange={onStateChange} required>
                    {INDIAN_STATES.map((s) => (
                      <option key={s.code} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label htmlFor="gstin" className="form-label">GSTIN <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input id="gstin" type="text" maxLength={15} className="form-input font-mono" placeholder="29XXXXX0000X1ZX"
                    value={form.gstin} onChange={set("gstin")}/>
                </div>
              </div>
            </div>

            <hr className="border-gray-100"/>

            {/* Account details */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Your Account</h3>
              <div>
                <label htmlFor="name" className="form-label">Your Name *</label>
                <input id="name" type="text" required className="form-input" placeholder="Rajesh Sharma"
                  value={form.name} onChange={set("name")}/>
              </div>
              <div>
                <label htmlFor="email" className="form-label">Email Address *</label>
                <input id="email" type="email" required className="form-input" placeholder="rajesh@business.com"
                  value={form.email} onChange={set("email")} autoComplete="email"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="password" className="form-label">Password *</label>
                  <input id="password" type="password" required minLength={10} className="form-input"
                    placeholder="Min. 10 characters" value={form.password} onChange={set("password")} autoComplete="new-password"/>
                </div>
                <div>
                  <label htmlFor="confirmPassword" className="form-label">Confirm *</label>
                  <input id="confirmPassword" type="password" required className="form-input"
                    placeholder="Repeat password" value={form.confirmPassword} onChange={set("confirmPassword")} autoComplete="new-password"/>
                </div>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-red-500 flex-shrink-0">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <button id="signup-submit" type="submit" disabled={loading} className="btn-primary w-full py-2.5 mt-1">
              {loading ? (
                <span className="flex items-center gap-2 justify-center">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Creating account…
                </span>
              ) : "Create account & start billing"}
            </button>
          </form>

          <p className="text-sm text-center text-gray-500 mt-6">
            Already have an account?{" "}
            <Link href="/login" className="text-brand-600 font-medium hover:text-brand-700 transition-colors">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
