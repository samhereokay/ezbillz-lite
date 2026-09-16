import { useState, useEffect } from "react";
import { DraftType } from "@prisma/client";
import { useToast } from "@/components/ui/toast";

type DraftMetadata = {
  id: string;
  type: DraftType;
  version: number;
  updatedAt: string;
  payload: any;
};

interface DraftRecoveryBannerProps {
  type: DraftType;
  onRecover: (draftId: string, version: number, payload: any) => void;
}

export function DraftRecoveryBanner({ type, onRecover }: DraftRecoveryBannerProps) {
  const [drafts, setDrafts] = useState<DraftMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetch(`/api/drafts?type=${type}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.drafts) {
          setDrafts(data.drafts);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [type]);

  const handleDiscard = async (id: string) => {
    try {
      const res = await fetch(`/api/drafts/${id}`, { method: "DELETE" });
      if (res.ok) {
        setDrafts((prev) => prev.filter((d) => d.id !== id));
        toast("Draft discarded");
      } else {
        toast("Failed to discard draft", "error");
      }
    } catch {
      toast("Network error", "error");
    }
  };

  if (loading || drafts.length === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
      <div className="flex items-start gap-3">
        <svg className="w-5 h-5 text-amber-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-amber-800">Unfinished Drafts</h3>
          <p className="text-xs text-amber-700 mb-3">You have unsaved work that can be recovered.</p>
          <div className="space-y-2">
            {drafts.map((d) => (
              <div key={d.id} className="flex items-center justify-between bg-white/60 p-2 rounded border border-amber-200/50">
                <span className="text-xs font-medium text-amber-900">
                  Last saved: {new Date(d.updatedAt).toLocaleString()}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleDiscard(d.id)}
                    className="text-xs text-red-600 hover:text-red-800 font-medium px-2 py-1"
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onRecover(d.id, d.version, d.payload);
                      // Remove from list so banner shrinks
                      setDrafts((prev) => prev.filter((item) => item.id !== d.id));
                    }}
                    className="text-xs bg-amber-600 hover:bg-amber-700 text-white font-medium px-3 py-1 rounded"
                  >
                    Continue Draft
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
