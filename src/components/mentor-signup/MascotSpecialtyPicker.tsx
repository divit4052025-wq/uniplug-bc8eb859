// P8 — mentor specialty picker (M4), driven by the in-repo mascot engine. Pick
// exactly ONE of the six fixed specialties (General default); each option renders
// WITH its mapped mascot. ARIA radiogroup with roving tabindex + arrow-key
// navigation (selection follows focus), mirroring the student MascotGradePicker.
import { useRef } from "react";

import { Mascot } from "@/components/mascots/Mascot";
import { MASCOTS } from "@/components/mascots/mascot-data";
import { SPECIALTIES, SPECIALTY_MASCOT, type SpecialtyKey } from "@/components/mascots/specialty";
import { cn } from "@/lib/utils";

interface MascotSpecialtyPickerProps {
  value: SpecialtyKey;
  onChange: (key: SpecialtyKey) => void;
}

export function MascotSpecialtyPicker({ value, onChange }: MascotSpecialtyPickerProps) {
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: React.KeyboardEvent, idx: number) => {
    let next = idx;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % SPECIALTIES.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      next = (idx - 1 + SPECIALTIES.length) % SPECIALTIES.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = SPECIALTIES.length - 1;
    else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      onChange(SPECIALTIES[idx].key);
      return;
    } else return;
    e.preventDefault();
    cardRefs.current[next]?.focus();
    onChange(SPECIALTIES[next].key);
  };

  return (
    <div
      role="radiogroup"
      aria-label="Your mentoring specialty"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      {SPECIALTIES.map((s, idx) => {
        const shape = SPECIALTY_MASCOT[s.key];
        const checked = value === s.key;
        return (
          <button
            key={s.key}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={`${s.label} — ${s.blurb}`}
            tabIndex={
              checked || (!SPECIALTIES.some((sp) => sp.key === value) && idx === 0) ? 0 : -1
            }
            ref={(el) => {
              cardRefs.current[idx] = el;
            }}
            onClick={() => onChange(s.key)}
            onKeyDown={(e) => onKeyDown(e, idx)}
            className={cn(
              "flex flex-col items-center rounded-2xl border-2 bg-background p-4 text-center transition focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/25",
              checked
                ? "border-primary bg-secondary/30 shadow-card"
                : "border-border hover:border-primary/40",
            )}
          >
            <Mascot
              shape={shape}
              color={MASCOTS[shape].color}
              expression={MASCOTS[shape].expression}
              size={88}
              idle={checked}
              shadow={false}
              decorative
            />
            <span className="mt-2 font-display text-base font-semibold text-foreground">
              {s.label}
            </span>
            <span className="text-xs font-light text-muted-foreground">{s.blurb}</span>
          </button>
        );
      })}
    </div>
  );
}
