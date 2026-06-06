// P7 — strict, async, multi-add typeahead over the Phase-0 ref_* taxonomy.
// Wraps shadcn Command (cmdk) in a Popover; server search via search_reference
// (shouldFilter disabled — the DB does the fuzzy match). "Can't find it → add"
// appends a pending RefItem with id:null; the caller files the actual
// create_ref_add_request (authenticated) at finalize. Reused by the wizard and
// the finalize fresh-collection fallback.
import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { searchReference } from "./refClient";
import type { RefItem, RefKind } from "./types";

interface RefMultiSelectProps {
  kind: RefKind;
  value: RefItem[];
  onChange: (items: RefItem[]) => void;
  placeholder?: string;
  /** Show the "can't find it → request to add" affordance. Default true. */
  allowRequest?: boolean;
  /** id for the trigger, so an external <label> can point at it. */
  triggerId?: string;
  /** Cap the number of selections. max={1} makes this a single-select (a new
   *  pick replaces the previous). Default unlimited. */
  max?: number;
  /** Close the popover after a selection (natural for single-select). */
  closeOnSelect?: boolean;
  /** Accessible name for the combobox trigger + search input (the visual
   *  caption is a non-label <span>, so the control names itself). */
  ariaLabel?: string;
  "aria-describedby"?: string;
}

function sameItem(a: RefItem, b: RefItem): boolean {
  if (a.id && b.id) return a.id === b.id;
  return a.name.toLowerCase() === b.name.toLowerCase();
}

export function RefMultiSelect({
  kind,
  value,
  onChange,
  placeholder = "Search…",
  allowRequest = true,
  triggerId,
  max,
  closeOnSelect = false,
  ariaLabel,
  "aria-describedby": describedBy,
}: RefMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RefItem[]>([]);
  const [loading, setLoading] = useState(false);
  const listId = useId();
  const reqSeq = useRef(0);

  // Debounced server search; stale responses are dropped via the sequence guard.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const seq = ++reqSeq.current;
    const t = setTimeout(async () => {
      const r = await searchReference(kind, q);
      if (seq === reqSeq.current) {
        setResults(r);
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query, kind]);

  const add = (item: RefItem) => {
    if (value.some((v) => sameItem(v, item))) {
      // already selected — no-op
    } else if (max === 1) {
      onChange([item]); // single-select: replace
    } else if (max && value.length >= max) {
      // at cap — ignore the extra pick
    } else {
      onChange([...value, item]);
    }
    setQuery("");
    setResults([]);
    if (closeOnSelect) setOpen(false);
  };

  const remove = (item: RefItem) => onChange(value.filter((v) => !sameItem(v, item)));

  const trimmed = query.trim();
  const hasExact =
    results.some((r) => r.name.toLowerCase() === trimmed.toLowerCase()) ||
    value.some((v) => v.name.toLowerCase() === trimmed.toLowerCase());
  const showRequest = allowRequest && trimmed.length > 0 && !hasExact;

  return (
    <div>
      {value.length > 0 && max !== 1 && (
        <ul className="mb-2 flex flex-wrap gap-1.5" aria-label="Selected">
          {value.map((item) => (
            <li key={item.id ?? `new:${item.name}`}>
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-foreground">
                {item.name}
                {item.id === null && (
                  <span className="text-[10px] font-normal text-muted-foreground">· requested</span>
                )}
                <button
                  type="button"
                  aria-label={`Remove ${item.name}`}
                  onClick={() => remove(item)}
                  className="inline-flex items-center justify-center rounded-full p-0.5 transition hover:bg-foreground/10 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            id={triggerId}
            aria-label={ariaLabel}
            aria-describedby={describedBy}
            aria-haspopup="listbox"
            aria-expanded={open}
            className={`flex w-full items-center justify-between rounded-xl border border-border bg-background px-4 py-3 text-left text-sm font-light transition hover:border-primary/50 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15 ${
              max === 1 && value.length === 1 ? "text-foreground" : "text-muted-foreground/80"
            }`}
          >
            {/* single-select (max=1) shows the chosen value in the trigger; multi shows chips above + the placeholder here */}
            {max === 1 && value.length === 1 ? value[0].name : placeholder}
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
          <Command shouldFilter={false}>
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Type to search…"
              aria-label={ariaLabel ? `Search ${ariaLabel}` : undefined}
              aria-controls={listId}
            />
            <CommandList id={listId}>
              {loading && (
                <div className="py-6 text-center text-sm text-muted-foreground">Searching…</div>
              )}
              {!loading && trimmed.length > 0 && results.length === 0 && !showRequest && (
                <CommandEmpty>No matches.</CommandEmpty>
              )}
              {results.length > 0 && (
                <CommandGroup>
                  {results.map((r) => {
                    const selected = value.some((v) => sameItem(v, r));
                    return (
                      <CommandItem
                        key={r.id ?? r.name}
                        value={r.id ?? r.name}
                        onSelect={() => add(r)}
                      >
                        <span className="flex-1">{r.name}</span>
                        {selected && <Check className="h-4 w-4 text-primary" />}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
              {showRequest && (
                <CommandGroup>
                  <CommandItem
                    value={`__request__${trimmed}`}
                    onSelect={() => add({ id: null, name: trimmed })}
                  >
                    <Plus className="h-4 w-4 text-primary" />
                    <span>
                      Can&apos;t find it — add <span className="font-medium">“{trimmed}”</span>
                    </span>
                  </CommandItem>
                </CommandGroup>
              )}
              {!loading && trimmed.length === 0 && (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  Start typing to search.
                </div>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
