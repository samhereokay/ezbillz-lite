"use client";

import { useEffect } from "react";

export type RecentItemType = 
  | "CUSTOMER" 
  | "SUPPLIER" 
  | "PRODUCT" 
  | "TAX_INVOICE" 
  | "QUOTATION" 
  | "DELIVERY_CHALLAN" 
  | "PURCHASE" 
  | "PAYMENT";

export interface RecentItem {
  id: string;
  type: RecentItemType;
  title: string;
  subtitle?: string;
  url: string;
  timestamp: number;
}

const MAX_RECENT_ITEMS = 15;

function getStorageKey(userId: string, orgId: string) {
  return `ezbillz_recent_${userId}_${orgId}`;
}

export function addRecentItem(userId: string, orgId: string, item: Omit<RecentItem, "timestamp">) {
  if (!userId || !orgId || !window.localStorage) return;

  const key = getStorageKey(userId, orgId);
  try {
    const raw = localStorage.getItem(key);
    let items: RecentItem[] = [];
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        items = parsed;
      }
    }

    // Deduplicate
    items = items.filter(i => i.id !== item.id || i.type !== item.type);

    // Add to front
    items.unshift({ ...item, timestamp: Date.now() });

    // Limit
    items = items.slice(0, MAX_RECENT_ITEMS);

    localStorage.setItem(key, JSON.stringify(items));
  } catch (err) {
    // Graceful failure if localStorage throws (e.g. quota exceeded or malformed json)
    console.warn("Failed to save recent item", err);
  }
}

export function getRecentItems(userId: string, orgId: string): RecentItem[] {
  if (!userId || !orgId || typeof window === "undefined" || !window.localStorage) return [];

  const key = getStorageKey(userId, orgId);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch (err) {
    // If malformed, clear it
    localStorage.removeItem(key);
    return [];
  }
}

/**
 * A hook to record a view in recent history once when a component mounts.
 */
export function useRecentItemRecord(
  userId: string | undefined,
  orgId: string | undefined,
  item: Omit<RecentItem, "timestamp"> | null
) {
  useEffect(() => {
    if (userId && orgId && item) {
      addRecentItem(userId, orgId, item);
    }
  }, [userId, orgId, item?.id, item?.type, item?.title, item?.url]); // Depend on scalar fields to avoid object reference loops
}
