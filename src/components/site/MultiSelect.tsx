import { useState } from "react";
import { X } from "lucide-react";

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
  const toggle = (opt: string) =>
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full flex-wrap items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2.5 text-left text-sm font-light text-foreground transition focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15"
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
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(v);
                }}
              />
            </span>
          ))
        )}
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
