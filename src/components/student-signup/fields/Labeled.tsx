// P7 — labeling helpers for the signup wizard.
//
// Caption: a NON-<label> field caption for COMPOSITE controls (the ref-data
// typeahead, mascot pickers, multi-select) — wrapping these in AuthShell's
// implicit <label> mis-binds the label to the first inner button (a chip's
// "Remove" control), so composite controls instead carry their own aria-label
// and use this plain <span> caption. (AuthShell's <label>-based Field stays the
// right choice for single native inputs.)
//
// FieldError: an inline error with role="alert" so a screen reader announces it
// when it appears after a failed validation (WCAG 3.3.1).
import type { ReactNode } from "react";

export function Caption({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-foreground/70">
        {label}
      </span>
      {children}
    </div>
  );
}

export function FieldError({ id, children }: { id?: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-xs text-destructive">
      {children}
    </p>
  );
}
