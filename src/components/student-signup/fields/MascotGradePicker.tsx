// P7 — grade picker driven by the in-repo mascot engine. UniPlug is Grade 9+:
// Sprout = Grades 9–10 (then a 9/10 sub-pick, since the DB stores a specific
// grade), Climber = Grade 11, Spark = Grade 12. Implemented as an ARIA
// radiogroup with roving tabindex + arrow-key navigation (selection follows
// focus); the mascot SVGs are decorative (the button label carries the meaning).
import { useRef, useState } from "react";

import { Mascot, type MascotShape } from "@/components/mascots/Mascot";
import { MASCOTS } from "@/components/mascots/mascot-data";
import { cn } from "@/lib/utils";

interface GradeGroup {
  key: string;
  shape: MascotShape;
  title: string;
  blurb: string;
  grades: string[];
}

const GROUPS: GradeGroup[] = [
  {
    key: "sprout",
    shape: "sprout",
    title: "Sprout",
    blurb: "Grades 9–10",
    grades: ["Grade 9", "Grade 10"],
  },
  { key: "climber", shape: "climber", title: "Climber", blurb: "Grade 11", grades: ["Grade 11"] },
  { key: "spark", shape: "spark", title: "Spark", blurb: "Grade 12", grades: ["Grade 12"] },
];

function groupForGrade(grade: string): GradeGroup | null {
  return GROUPS.find((g) => g.grades.includes(grade)) ?? null;
}

interface MascotGradePickerProps {
  value: string;
  onChange: (grade: string) => void;
  /** id of an external error message, linked via aria-describedby. */
  describedById?: string;
}

const SPROUT_GRADES = ["Grade 9", "Grade 10"];

export function MascotGradePicker({ value, onChange, describedById }: MascotGradePickerProps) {
  const active = groupForGrade(value);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const subRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const selectGroup = (g: GradeGroup) => {
    // Single-grade groups commit immediately; Sprout reveals the 9/10 sub-pick
    // (keep an existing 9/10 value, else leave unset until the student picks).
    if (g.grades.length === 1) onChange(g.grades[0]);
    else if (!g.grades.includes(value)) onChange("");
    setOpenKey(g.key);
  };

  const onKeyDown = (e: React.KeyboardEvent, idx: number) => {
    let next = idx;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % GROUPS.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      next = (idx - 1 + GROUPS.length) % GROUPS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = GROUPS.length - 1;
    else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      selectGroup(GROUPS[idx]);
      return;
    } else return;
    e.preventDefault();
    cardRefs.current[next]?.focus();
    selectGroup(GROUPS[next]);
  };

  const onSubKeyDown = (e: React.KeyboardEvent, i: number) => {
    let next = i;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % SPROUT_GRADES.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      next = (i - 1 + SPROUT_GRADES.length) % SPROUT_GRADES.length;
    else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      onChange(SPROUT_GRADES[i]);
      return;
    } else return;
    e.preventDefault();
    subRefs.current[next]?.focus();
    onChange(SPROUT_GRADES[next]);
  };

  const showSproutSub = openKey === "sprout" || active?.key === "sprout";

  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Your current grade"
        aria-describedby={describedById}
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        {GROUPS.map((g, idx) => {
          const checked = active?.key === g.key;
          return (
            <button
              key={g.key}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={`${g.title} — ${g.blurb}`}
              tabIndex={checked || (!active && idx === 0) ? 0 : -1}
              ref={(el) => {
                cardRefs.current[idx] = el;
              }}
              onClick={() => selectGroup(g)}
              onKeyDown={(e) => onKeyDown(e, idx)}
              className={cn(
                "flex flex-col items-center rounded-2xl border-2 bg-background p-4 text-center transition focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/25",
                checked
                  ? "border-primary bg-secondary/30 shadow-card"
                  : "border-border hover:border-primary/40",
              )}
            >
              <Mascot
                shape={g.shape}
                color={MASCOTS[g.shape].color}
                expression={MASCOTS[g.shape].expression}
                size={104}
                idle={checked}
                shadow={false}
                decorative
              />
              <span className="mt-2 font-display text-lg font-semibold text-foreground">
                {g.title}
              </span>
              <span className="text-xs font-light text-muted-foreground">{g.blurb}</span>
            </button>
          );
        })}
      </div>

      {showSproutSub && (
        <div className="mt-4 rounded-2xl border border-dashed border-border bg-brand-cream/40 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-foreground/70">
            Which grade exactly?
          </p>
          <div role="radiogroup" aria-label="Sprout grade" className="flex gap-2">
            {SPROUT_GRADES.map((grade, i) => {
              const checked = value === grade;
              return (
                <button
                  key={grade}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  tabIndex={checked || (!SPROUT_GRADES.includes(value) && i === 0) ? 0 : -1}
                  ref={(el) => {
                    subRefs.current[i] = el;
                  }}
                  onClick={() => onChange(grade)}
                  onKeyDown={(e) => onSubKeyDown(e, i)}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm transition focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/25",
                    checked
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:border-primary/50",
                  )}
                >
                  {grade}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
