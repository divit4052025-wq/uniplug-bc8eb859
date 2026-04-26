import { useEffect, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select...",
}: {
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const toggle = (opt: string) =>
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full flex-wrap items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2.5 pr-10 text-left text-sm font-light text-foreground transition focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15"
      >
        {value.length === 0 ? (
          <span className="px-1 py-0.5 text-muted-foreground/60">{placeholder}</span>
        ) : (
          value.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-foreground"
            >
              {v}
              <span
                role="button"
                tabIndex={0}
                aria-label={`Remove ${v}`}
                className="inline-flex cursor-pointer items-center justify-center rounded-full p-0.5 hover:bg-foreground/10"
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(v);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    toggle(v);
                  }
                }}
              >
                <X className="h-3 w-3" />
              </span>
            </span>
          ))
        )}
        <ChevronDown
          className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-transform duration-200 ${
            open ? "rotate-180" : "rotate-0"
          }`}
        />
      </button>
      {open && (
        <div className="absolute z-20 mt-2 max-h-56 w-full overflow-auto rounded-xl border border-border bg-background p-2 shadow-lift">
          {options.map((opt) => (
            <button
              type="button"
              key={opt}
              onClick={() => toggle(opt)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition hover:bg-secondary ${
                value.includes(opt) ? "bg-secondary/60 font-medium" : "font-light"
              }`}
            >
              {opt}
              {value.includes(opt) && <span className="text-primary">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
