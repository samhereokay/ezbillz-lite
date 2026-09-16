import { AutoSaveStatus } from "@/hooks/useAutoSave";

interface DraftStatusIndicatorProps {
  status: AutoSaveStatus;
  lastSavedAt: Date | null;
}

export function DraftStatusIndicator({ status, lastSavedAt }: DraftStatusIndicatorProps) {
  if (status === "IDLE" && !lastSavedAt) return null;

  return (
    <div className="flex items-center gap-1.5 text-xs font-medium">
      {status === "SAVING" && (
        <>
          <svg className="animate-spin w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="text-gray-500">Saving draft...</span>
        </>
      )}
      {status === "SAVED" && lastSavedAt && (
        <>
          <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-gray-500">
            Draft saved at {lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </>
      )}
      {status === "ERROR" && (
        <>
          <svg className="w-3.5 h-3.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-red-500">Save failed</span>
        </>
      )}
    </div>
  );
}
