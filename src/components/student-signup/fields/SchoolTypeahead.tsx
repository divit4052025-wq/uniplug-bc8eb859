// P7 — LENIENT single-value school field. Suggestions come from search_schools,
// but the typed value is always authoritative (India's school list can't be
// cleanly seeded, so this NEVER blocks signup; the free text is captured on
// students.school). Value is a plain string carried in the auth.signUp metadata.
//
// a11y: this is a plain text input with a non-ARIA suggestion list (the typed
// value always wins, so we deliberately do NOT claim the combobox/listbox
// contract — the suggestion buttons are Tab-reachable helpers).
import { useEffect, useId, useRef, useState } from "react";

import { inputClass } from "@/components/site/AuthShell";
import { searchSchools } from "@/components/signup/refClient";
import type { RefItem } from "../types";

interface SchoolTypeaheadProps {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  ariaLabel?: string;
  placeholder?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

export function SchoolTypeahead({
  value,
  onChange,
  id,
  ariaLabel,
  placeholder = "Start typing your school…",
  "aria-describedby": describedBy,
  "aria-invalid": ariaInvalid,
}: SchoolTypeaheadProps) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<RefItem[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const reqSeq = useRef(0);
  const listId = useId();

  useEffect(() => {
    const q = value.trim();
    if (!q || !open) {
      setResults([]);
      return;
    }
    const seq = ++reqSeq.current;
    const t = setTimeout(async () => {
      const r = await searchSchools(q);
      if (seq === reqSeq.current) setResults(r);
    }, 200);
    return () => clearTimeout(t);
  }, [value, open]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const showList = open && results.length > 0;

  return (
    <div className="relative" ref={wrapRef}>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        aria-label={ariaLabel}
        aria-describedby={showList ? `${listId} ${describedBy ?? ""}`.trim() : describedBy}
        aria-invalid={ariaInvalid}
        autoComplete="off"
        className={inputClass}
        placeholder={placeholder}
      />
      {showList && (
        <div
          id={listId}
          className="absolute z-30 mt-2 w-full rounded-xl border border-border bg-background p-1 shadow-lift"
        >
          <p className="px-2 pb-1 pt-1 text-[11px] font-light text-muted-foreground">Suggestions</p>
          <ul className="max-h-56 overflow-auto">
            {results.map((r) => (
              <li key={r.id ?? r.name}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(r.name);
                    setOpen(false);
                  }}
                  className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-light transition hover:bg-secondary focus:bg-secondary focus:outline-none"
                >
                  {r.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
