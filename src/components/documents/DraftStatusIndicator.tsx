import { AutoSaveStatus } from "@/hooks/useAutoSave";

interface DraftStatusIndicatorProps {
  status: AutoSaveStatus;
  lastSavedAt: Date | null;
  onReload?: () => void;
}

export function DraftStatusIndicator({ status, lastSavedAt, onReload }: DraftStatusIndicatorProps) {
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
      {status === "OFFLINE" && (
        <>
          <svg className="w-3.5 h-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
          </svg>
          <span className="text-amber-500">Network disconnected. Retrying...</span>
        </>
      )}
      {status === "CONFLICT" && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-2 py-1 rounded-md">
          <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>This draft was updated in another tab.</span>
          {onReload && (
            <button onClick={onReload} type="button" className="text-amber-700 underline font-semibold hover:text-amber-900 ml-1">
              Reload newer version
            </button>
          )}
        </div>
      )}
    </div>
  );
}
