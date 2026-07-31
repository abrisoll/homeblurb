"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { AddressSuggestion } from "@/lib/types";

const MIN_CHARS = 4;
const DEBOUNCE_MS = 300;

export default function AddressAutocompleteInput({
  value,
  onChange,
  placeholder,
  className,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  function handleInputChange(newValue: string) {
    onChange(newValue);
    setActiveIndex(-1);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();

    const trimmed = newValue.trim();
    if (trimmed.length < MIN_CHARS) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(
          `/api/autocomplete?text=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal }
        );
        if (!res.ok) return;
        const data = await res.json();
        const results: AddressSuggestion[] = data.suggestions ?? [];
        setSuggestions(results);
        setOpen(results.length > 0);
      } catch {
        // request was aborted (user kept typing) or a network hiccup — ignore
      }
    }, DEBOUNCE_MS);
  }

  function selectSuggestion(suggestion: AddressSuggestion) {
    onChange(suggestion.formatted);
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      if (activeIndex >= 0) {
        e.preventDefault();
        selectSuggestion(suggestions[activeIndex]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => handleInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
        autoFocus={autoFocus}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls="address-suggestion-list"
        aria-activedescendant={
          activeIndex >= 0 ? `address-suggestion-${activeIndex}` : undefined
        }
      />
      {open && suggestions.length > 0 && (
        <ul
          id="address-suggestion-list"
          role="listbox"
          className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border border-neutral-200 bg-white py-1 shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li key={`${s.formatted}-${i}`} id={`address-suggestion-${i}`} role="option" aria-selected={i === activeIndex}>
              <button
                type="button"
                onClick={() => selectSuggestion(s)}
                onMouseEnter={() => setActiveIndex(i)}
                className={`block w-full px-3 py-2 text-left text-sm ${
                  i === activeIndex
                    ? "bg-brand-green/10 text-brand-green-deep"
                    : "text-neutral-700"
                }`}
              >
                <span className="block truncate">
                  {s.addressLine1 ?? s.formatted}
                </span>
                {s.addressLine1 && s.addressLine2 && (
                  <span className="block truncate text-xs text-neutral-400">
                    {s.addressLine2}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
