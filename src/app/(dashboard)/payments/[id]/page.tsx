"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { formatINR, formatDate, paymentMethodLabel } from "@/lib/utils";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCommandPalette } from "@/components/ui/CommandPalette";
import { useRecentItemRecord, RecentItemType } from "@/lib/recentHistory";

export default function PaymentDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [payment, setPayment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const { data: session } = useSession();
  const { orgId } = useCommandPalette();
  
  useRecentItemRecord(
    (session?.user as any)?.id, 
    orgId, 
    payment ? {
      id: `pay-${payment.id}`,
      type: "PAYMENT" as RecentItemType,
      title: payment.receiptNumber || `Payment ${payment.id.slice(-6)}`,
      subtitle: `₹${Number(payment.amount).toFixed(2)}`,
      url: `/payments/${payment.id}`
    } : null
  );

  useEffect(() => {
    fetch(`/api/payments/${id}`)
      .then(r => r.json())
      .then(d => {
        if (d.payment) setPayment(d.payment);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-8 text-center text-gray-500">Loading payment details...</div>;
  if (!payment) return <div className="p-8 text-center text-red-500">Payment not found</div>;

  const party = payment.direction === 'RECEIVED' ? payment.customer : payment.supplier;
  const docRef = payment.invoice ? `Invoice #${payment.invoice.number}` : (payment.purchase ? `Purchase #${payment.purchase.billNumber || payment.purchase.id}` : null);

  return (
    <div className="max-w-3xl mx-auto py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/payments" className="inline-flex items-center text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
          <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          Back to Payments
        </Link>
        <div className="flex items-center gap-3">
          <a
            href={`/api/payments/${id}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
            Print
          </a>
          <a
            href={`/api/payments/${id}/pdf`}
            download={`Receipt-${payment.receiptNumber || id}.pdf`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            Download PDF
          </a>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 bg-gray-50/50 p-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">
                Receipt {payment.receiptNumber ? `#${payment.receiptNumber}` : ''}
              </h1>
              <p className="text-sm text-gray-500">Recorded on {formatDate(payment.paidAt)}</p>
            </div>
            <div className="text-right">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${payment.direction === 'RECEIVED' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}>
                {payment.direction === 'RECEIVED' ? 'Received In' : 'Paid Out'}
              </span>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-3">{payment.direction === 'RECEIVED' ? 'Received From' : 'Paid To'}</h3>
              {party ? (
                <div>
                  <p className="font-semibold text-gray-900">{party.name}</p>
                  {(party.city || party.state) && (
                    <p className="text-sm text-gray-600 mt-1">{[party.city, party.state].filter(Boolean).join(', ')}</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500 italic">No party linked</p>
              )}
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-3">Payment Details</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Method:</dt>
                  <dd className="font-medium text-gray-900">{paymentMethodLabel(payment.method)}</dd>
                </div>
                {docRef && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Reference:</dt>
                    <dd className="font-medium text-gray-900">{docRef}</dd>
                  </div>
                )}
                {payment.note && (
                  <div className="flex justify-between border-t border-gray-100 pt-2 mt-2">
                    <dt className="text-gray-500">Notes:</dt>
                    <dd className="text-gray-900 text-right max-w-[200px] truncate" title={payment.note}>{payment.note}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-6 flex items-center justify-between">
            <span className="text-gray-600 font-medium">Amount {payment.direction === 'RECEIVED' ? 'Received' : 'Paid'}</span>
            <span className="text-3xl font-bold text-gray-900">{formatINR(payment.amount)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
