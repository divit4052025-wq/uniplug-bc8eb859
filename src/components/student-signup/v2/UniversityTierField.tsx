// Student-signup v2 — the universities scene picker. Matches the design's
// row-per-university layout with dream/target/safety tier toggles, while wiring
// to the REAL reference-data backend: search_reference("university") for the
// typeahead and a "can't find it → request to add" affordance that stores an
// unresolved pick (id:null). At finalize, resolved picks become student_schools
// rows with category = the chosen tier; unresolved picks are saved by name (NULL
// ref_university_id) and a create_ref_add_request is filed (profileWrite). No
// free-text-where-an-id-is-expected: a typed-but-unmatched name is explicitly a
// request-to-add, never silently treated as a linked university.
import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";

import { searchReference } from "@/components/signup/refClient";
import type { RefItem } from "@/components/signup/types";
import type { UniPick, UniTier } from "../types";

const TIERS: { key: UniTier; label: string; activeBg: string }[] = [
  { key: "dream", label: "Dream", activeBg: "var(--brand-rose)" },
  { key: "target", label: "Target", activeBg: "#9AD6C6" },
  { key: "safety", label: "Safety", activeBg: "#C5D9B0" },
];

const inactiveTier = { background: "rgba(26,26,26,.05)", color: "var(--brand-ink-faint)" } as const;

export function UniversityTierField({
  value,
  onChange,
}: {
  value: UniPick[];
  onChange: (v: UniPick[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RefItem[]>([]);
  const [open, setOpen] = useState(false);
  const reqSeq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const seq = ++reqSeq.current;
    const t = window.setTimeout(async () => {
      const r = await searchReference("university", q);
      if (seq === reqSeq.current) setResults(r);
    }, 200);
    return () => window.clearTimeout(t);
  }, [query]);

  const exists = (name: string) => value.some((p) => p.name.toLowerCase() === name.toLowerCase());

  const add = (item: RefItem) => {
    if (!exists(item.name)) onChange([...value, { id: item.id, name: item.name, tier: "target" }]);
    setQuery("");
    setResults([]);
    setOpen(false);
  };
  const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx));
  const setTier = (idx: number, tier: UniTier) =>
    onChange(value.map((p, i) => (i === idx ? { ...p, tier } : p)));

  const trimmed = query.trim();
  const hasExact =
    results.some((r) => r.name.toLowerCase() === trimmed.toLowerCase()) || exists(trimmed);
  const showRequest = trimmed.length > 0 && !hasExact;

  return (
    <div className="space-y-3">
      <div className="relative">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          placeholder="Type a university name…"
          aria-label="Add a university you're aiming for"
          className="w-full rounded-md border border-border bg-background px-4 py-3.5 text-[16px] font-medium text-foreground outline-none placeholder:text-brand-ink-faint focus:border-primary"
        />
        {open && (results.length > 0 || showRequest) && (
          <ul className="absolute z-20 mt-1.5 max-h-64 w-full overflow-auto rounded-md border border-border bg-background py-1 shadow-lg">
            {results.map((r) => (
              <li key={r.id ?? r.name}>
                <button
                  type="button"
                  data-hov
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => add(r)}
                  className="flex w-full cursor-none items-center px-4 py-2.5 text-left text-[15px] text-foreground hover:bg-muted"
                >
                  {r.name}
                </button>
              </li>
            ))}
            {showRequest && (
              <li>
                <button
                  type="button"
                  data-hov
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => add({ id: null, name: trimmed })}
                  className="flex w-full cursor-none items-center gap-2 px-4 py-2.5 text-left text-[15px] text-foreground hover:bg-muted"
                >
                  <Plus className="h-4 w-4 text-primary" />
                  Can&apos;t find it — add <span className="font-semibold">“{trimmed}”</span>
                </button>
              </li>
            )}
          </ul>
        )}
      </div>

      {value.length > 0 && (
        <ul className="space-y-2.5">
          {value.map((p, i) => (
            <li
              key={p.id ?? `new:${p.name}`}
              className="flex items-center gap-3 rounded-md border border-border bg-background px-3.5 py-3"
            >
              <span className="flex-1 text-[15px] font-semibold text-foreground">
                {p.name}
                {p.id === null && (
                  <span className="ml-1.5 text-[11px] font-normal text-brand-ink-faint">
                    · requested
                  </span>
                )}
              </span>
              <div className="flex gap-1">
                {TIERS.map((t) => {
                  const active = p.tier === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      data-mag
                      data-hov
                      aria-pressed={active}
                      onClick={() => setTier(i, t.key)}
                      className="cursor-none rounded-[5px] px-2.5 py-1.5 text-[11.5px] font-bold tracking-[0.02em] transition"
                      style={active ? { background: t.activeBg, color: "#1A1A1A" } : inactiveTier}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                data-hov
                aria-label={`Remove ${p.name}`}
                onClick={() => remove(i)}
                className="flex h-6 w-6 shrink-0 cursor-none items-center justify-center text-brand-ink-faint"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[12px] text-brand-ink-faint">
        Tag each as a dream, target, or safety pick.
      </p>
    </div>
  );
}
