"use client";

import { MapPinIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface PhotonFeature {
  properties: {
    name?: string;
    city?: string;
    state?: string;
    country?: string;
  };
}

function formatSuggestion(feature: PhotonFeature): string {
  const p = feature.properties;
  const place = p.city ?? p.state ?? p.name ?? "";
  const country = p.country ?? "";
  if (place && country) return `${place}, ${country}`;
  return place || country || p.name || "";
}

interface DestinationInputProps {
  destinations: string[];
  onChange: (destinations: string[]) => void;
  error?: string;
}

export function DestinationInput({ destinations, onChange, error }: DestinationInputProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    if (query.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lang=pt`,
          { signal: controller.signal }
        );
        clearTimeout(timeout);
        const data = await res.json();
        const results: string[] = (data.features ?? [])
          .map(formatSuggestion)
          .filter((s: string) => s.length > 0);
        setSuggestions(results);
        setOpen(results.length > 0);
      } catch {
        setSuggestions([]);
        setOpen(false);
      }
    }, 300);
  }, [query]);

  function addDestination(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (trimmed.length > 120) {
      setInputError("Nome do destino muito longo (máx. 120 caracteres).");
      return;
    }
    if (destinations.includes(trimmed)) {
      setQuery("");
      setOpen(false);
      return;
    }
    onChange([...destinations, trimmed]);
    setQuery("");
    setSuggestions([]);
    setOpen(false);
    setInputError(null);
  }

  function removeDestination(index: number) {
    onChange(destinations.filter((_, i) => i !== index));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addDestination(query);
    }
    if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Tags */}
      {destinations.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {destinations.map((dest, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 bg-[#ff6b6b] text-white rounded-full px-3 py-1 text-sm font-medium"
            >
              {dest}
              <button
                type="button"
                onClick={() => removeDestination(i)}
                className="hover:opacity-70 transition-opacity"
                aria-label={`Remover ${dest}`}
              >
                <XIcon size={13} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="relative">
        <MapPinIcon
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b8b8b] pointer-events-none"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Buscar cidade ou país..."
          className="w-full rounded-lg border border-[rgba(0,0,0,0.12)] bg-white pl-8 pr-3 py-2.5 text-sm text-[#242424] placeholder-[#8b8b8b] focus:border-[#ff6b6b] focus:outline-none focus:ring-1 focus:ring-[#ff6b6b] transition-colors"
        />
      </div>

      {/* Inline error */}
      {(error || inputError) && (
        <p className="text-xs text-red-500 mt-1">{inputError ?? error}</p>
      )}

      {/* Dropdown */}
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-[rgba(0,0,0,0.08)] rounded-xl shadow-lg overflow-hidden">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => addDestination(s)}
              className="w-full text-left px-4 py-2.5 text-sm text-[#242424] hover:bg-[#fff9f6] flex items-center gap-2 transition-colors"
            >
              <MapPinIcon size={13} className="text-[#ff6b6b] shrink-0" />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
