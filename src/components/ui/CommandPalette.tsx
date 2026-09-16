"use client";

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getRecentItems, RecentItem, RecentItemType } from "@/lib/recentHistory";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";

// ─── CONTEXT ────────────────────────────────────────────────────────────────
interface CommandPaletteContextType {
  isOpen: boolean;
  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;
  orgId?: string;
}

const CommandPaletteContext = createContext<CommandPaletteContextType | undefined>(undefined);

export function useCommandPalette() {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) throw new Error("useCommandPalette must be used within CommandPaletteProvider");
  return ctx;
}

export function CommandPaletteProvider({ children, orgId }: { children: React.ReactNode, orgId?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  const openPalette = useCallback(() => setIsOpen(true), []);
  const closePalette = useCallback(() => setIsOpen(false), []);
  const togglePalette = useCallback(() => setIsOpen((prev) => !prev), []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle palette: Ctrl+K or Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        togglePalette();
        return;
      }

      // Close on escape
      if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        closePalette();
        return;
      }

      // If active element is an input, don't trigger creation shortcuts
      const activeElement = document.activeElement as HTMLElement;
      const isInput = activeElement?.tagName === "INPUT" || 
                      activeElement?.tagName === "TEXTAREA" || 
                      activeElement?.tagName === "SELECT" ||
                      activeElement?.isContentEditable;

      if (!isInput && e.altKey) {
        if (e.key.toLowerCase() === "i") { e.preventDefault(); router.push("/invoices/new"); }
        if (e.key.toLowerCase() === "q") { e.preventDefault(); router.push("/quotations/new"); }
        if (e.key.toLowerCase() === "c") { e.preventDefault(); router.push("/customers?new=true"); }
        if (e.key.toLowerCase() === "p") { e.preventDefault(); router.push("/products?new=true"); }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, togglePalette, closePalette, router]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  return (
    <CommandPaletteContext.Provider value={{ isOpen, openPalette, closePalette, togglePalette, orgId }}>
      {children}
      {isOpen && <CommandPaletteModal onClose={closePalette} orgId={orgId} />}
    </CommandPaletteContext.Provider>
  );
}

// ─── SEARCH RESULT TYPES ─────────────────────────────────────────────────────
export interface SearchResult {
  id: string;
  type: RecentItemType;
  title: string;
  subtitle: string;
  url: string;
}

// ─── HOOK FOR SEARCH ─────────────────────────────────────────────────────────
function useGlobalSearch(query: string) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(false);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        if (!res.ok) throw new Error("Search failed");
        const data = await res.json();
        if (isMounted) {
          setResults(data.results || []);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          console.error(err);
          setError(true);
          setLoading(false);
        }
      }
    }, 250); // 250ms debounce

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [query]);

  return { results, loading, error };
}

// ─── MODAL COMPONENT ─────────────────────────────────────────────────────────
function CommandPaletteModal({ onClose, orgId }: { onClose: () => void, orgId?: string }) {
  const router = useRouter();
  const { data: session } = useSession();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const { results, loading, error } = useGlobalSearch(query);
  
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  // Load recent items
  useEffect(() => {
    const uid = (session?.user as any)?.id;
    if (uid && orgId) {
      setRecentItems(getRecentItems(uid, orgId));
    }
  }, [session, orgId]);

  // Handle focus
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const items = React.useMemo(() => {
    if (query.trim().length >= 2) {
      return results;
    }
    // Default state: Quick Create + Recent + Nav
    const defaults = [
      { id: "new-invoice", type: "TAX_INVOICE", title: "Create Invoice", subtitle: "Alt+I", url: "/invoices/new" },
      { id: "new-quote", type: "QUOTATION", title: "Create Quotation", subtitle: "Alt+Q", url: "/quotations/new" },
      { id: "new-challan", type: "DELIVERY_CHALLAN", title: "Create Delivery Challan", subtitle: "", url: "/challans/new" },
      { id: "new-purchase", type: "PURCHASE", title: "Record Purchase", subtitle: "", url: "/purchases/new" },
      { id: "new-customer", type: "CUSTOMER", title: "Add Customer", subtitle: "Alt+C", url: "/customers?new=true" },
      { id: "new-supplier", type: "SUPPLIER", title: "Add Supplier", subtitle: "", url: "/suppliers?new=true" },
      { id: "new-product", type: "PRODUCT", title: "Add Product", subtitle: "Alt+P", url: "/products?new=true" },
      { id: "new-payment", type: "PAYMENT", title: "Record Payment", subtitle: "", url: "/payments/new" },
    ];
    // We can map recent items to match the exact same structure for the list
    const recents = recentItems.map(r => ({
      id: `recent-${r.id}`,
      type: r.type,
      title: r.title,
      subtitle: `Recent ${r.type}`,
      url: r.url
    }));
    return [...defaults, ...recents];
  }, [query, results, recentItems]);

  useEffect(() => {
    setActiveIndex(0); // Reset selection when items change
  }, [items]);

  const handleSelect = (url: string) => {
    onClose();
    router.push(url);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!loading && !error) {
        setActiveIndex(prev => (prev < items.length - 1 ? prev + 1 : prev));
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!loading && !error) {
        setActiveIndex(prev => (prev > 0 ? prev - 1 : prev));
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (!loading && !error && items[activeIndex]) {
        handleSelect(items[activeIndex].url);
      }
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.children[activeIndex] as HTMLElement;
      if (activeEl) {
        // block: "nearest" ensures we only scroll if it's out of view
        activeEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [activeIndex]);

  return (
    <div 
      className="fixed inset-0 z-50 bg-gray-900/50 backdrop-blur-sm flex items-start justify-center pt-[10vh] sm:pt-[15vh] px-4 pb-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
    >
      <div 
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh] sm:max-h-[60vh]"
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center px-4 py-3 border-b border-gray-100">
          <svg className="w-5 h-5 text-gray-400 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent border-none outline-none text-gray-900 placeholder-gray-400 text-sm sm:text-base"
            placeholder="Search customers, invoices, products... or type a command"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button onClick={onClose} className="text-[10px] sm:text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded hidden sm:block">
            ESC
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2" ref={listRef}>
          {query.trim().length > 0 && query.trim().length < 2 && (
            <div className="px-4 py-8 text-center text-sm text-gray-500">
              Type at least 2 characters to search...
            </div>
          )}

          {loading && (
            <div className="px-4 py-8 text-center text-sm text-gray-500">
              Searching...
            </div>
          )}

          {error && (
            <div className="px-4 py-8 text-center text-sm text-red-500">
              Search failed. Please try again.
            </div>
          )}

          {!loading && !error && query.trim().length >= 2 && items.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-gray-500">
              No results found for "{query}".
            </div>
          )}

          {!loading && !error && items.length > 0 && items.map((item, index) => {
            const isActive = index === activeIndex;
            return (
              <div
                key={item.id}
                id={`cmd-item-${index}`}
                role="option"
                aria-selected={isActive}
                className={cn(
                  "flex items-center justify-between px-4 py-2.5 rounded-lg cursor-pointer transition-colors",
                  isActive ? "bg-brand-50 text-brand-900" : "hover:bg-gray-50 text-gray-700"
                )}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => handleSelect(item.url)}
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{item.title}</span>
                  {(item.subtitle || item.type) && (
                    <span className={cn("text-xs mt-0.5", isActive ? "text-brand-600" : "text-gray-500")}>
                      {item.subtitle || item.type}
                    </span>
                  )}
                </div>
                {isActive && (
                  <svg className="w-4 h-4 text-brand-600 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>

        <div className="bg-gray-50 px-4 py-2 text-[10px] text-gray-500 border-t border-gray-100 flex items-center justify-between hidden sm:flex">
          <div className="flex gap-4">
            <span className="flex items-center gap-1"><kbd className="bg-white px-1.5 py-0.5 rounded border border-gray-200">↑↓</kbd> Navigate</span>
            <span className="flex items-center gap-1"><kbd className="bg-white px-1.5 py-0.5 rounded border border-gray-200">↵</kbd> Select</span>
          </div>
          <span>EZBILLZ Command Palette</span>
        </div>
      </div>
    </div>
  );
}
