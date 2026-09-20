import { useState, useEffect, useRef } from "react";
import { DraftType } from "@prisma/client";

export type AutoSaveStatus = "IDLE" | "SAVING" | "SAVED" | "ERROR" | "CONFLICT" | "OFFLINE";

interface UseAutoSaveOptions<T> {
  type: DraftType;
  entityId?: string;
  data: T;
  debounceMs?: number;
  enabled?: boolean;
  onConflictReload?: (draft: any) => void;
}

export function useAutoSave<T>({ type, entityId, data, debounceMs = 1500, enabled = true, onConflictReload }: UseAutoSaveOptions<T>) {
  const [status, setStatus] = useState<AutoSaveStatus>("IDLE");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  
  // Track draft locally
  const draftIdRef = useRef<string | null>(null);
  const versionRef = useRef<number>(1);
  const lastSavedDataRef = useRef<string>(JSON.stringify(data));
  const dataRef = useRef(data);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const savingRef = useRef(false);

  // Keep dataRef current
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // Provide a method to manually inject an existing draft ID/version (for recovery)
  const initializeDraft = (id: string, version: number) => {
    draftIdRef.current = id;
    versionRef.current = version;
    lastSavedDataRef.current = JSON.stringify(dataRef.current);
  };

  const clearDraft = async () => {
    if (draftIdRef.current) {
      try {
        await fetch(`/api/drafts/${draftIdRef.current}`, { method: "DELETE" });
      } catch (e) {
        console.error("Failed to clear draft", e);
      }
      draftIdRef.current = null;
      versionRef.current = 1;
    }
    setStatus("IDLE");
    setLastSavedAt(null);
  };

  useEffect(() => {
    if (!enabled) return;

    const currentStr = JSON.stringify(data);
    
    // Nothing changed? Don't save.
    if (currentStr === lastSavedDataRef.current) return;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    
    setStatus("SAVING");

    timeoutRef.current = setTimeout(async () => {
      if (savingRef.current) {
        // If already saving, queue another save soon
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          // just let the next cycle handle it
        }, debounceMs);
        return;
      }

      savingRef.current = true;
      try {
        const payloadToSave = JSON.parse(currentStr);
        let res;

        if (draftIdRef.current) {
          // Update existing
          res = await fetch(`/api/drafts/${draftIdRef.current}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              payload: payloadToSave,
              version: versionRef.current,
            }),
          });
        } else {
          // Create new
          res = await fetch("/api/drafts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type,
              entityId,
              payload: payloadToSave,
            }),
          });
        }

        const resData = await res.json();

        if (res.ok && resData.draft) {
          draftIdRef.current = resData.draft.id;
          versionRef.current = resData.draft.version;
          lastSavedDataRef.current = currentStr;
          setStatus("SAVED");
          setLastSavedAt(new Date());
        } else if (res.status === 409) {
          // Conflict!
          setStatus("CONFLICT");
          console.error("Draft version conflict:", resData.error);
        } else {
          setStatus("ERROR");
        }
      } catch (err) {
        setStatus("OFFLINE");
      } finally {
        savingRef.current = false;
      }
    }, debounceMs);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [data, debounceMs, enabled, type, entityId]);

  const reloadFromServer = async () => {
    if (!draftIdRef.current || !onConflictReload) return;
    try {
      const res = await fetch(`/api/drafts/${draftIdRef.current}`);
      if (res.ok) {
        const resData = await res.json();
        if (resData.draft) {
          initializeDraft(resData.draft.id, resData.draft.version);
          onConflictReload(resData.draft.payload);
          setStatus("SAVED");
        }
      }
    } catch (e) {
      console.error("Failed to reload draft", e);
    }
  };

  return {
    status,
    lastSavedAt,
    draftId: draftIdRef.current,
    initializeDraft,
    clearDraft,
    reloadFromServer,
  };
}
