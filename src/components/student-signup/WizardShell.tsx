// P7 — layout shell for the student signup wizard. Reuses the site Nav/Footer +
// Logo + design tokens, adds the progress bar + clickable step tabs + Back/Next.
// The `.signup-wizard` wrapper scopes the decided brand fonts (Gabarito display
// + Quicksand body) to this subtree only (see src/styles.css).
import { useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";

import { Footer } from "@/components/site/Footer";
import { Logo } from "@/components/site/Logo";
import { Nav } from "@/components/site/Nav";
import { cn } from "@/lib/utils";

export interface WizardStepMeta {
  key: string;
  label: string;
}

interface WizardShellProps {
  steps: WizardStepMeta[];
  stepIndex: number;
  maxReached: number;
  onJump: (index: number) => void;
  title: string;
  hint?: string;
  children: React.ReactNode;
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextLoading?: boolean;
  nextDisabled?: boolean;
}

export function WizardShell({
  steps,
  stepIndex,
  maxReached,
  onJump,
  title,
  hint,
  children,
  onBack,
  onNext,
  nextLabel = "Continue",
  nextLoading = false,
  nextDisabled = false,
}: WizardShellProps) {
  const total = steps.length;
  const pct = Math.round(((stepIndex + 1) / total) * 100);

  // Move focus to the step heading on each step change so AT users land in the
  // new step (replaces the noisy whole-section aria-live).
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [stepIndex]);

  return (
    <div className="signup-wizard min-h-screen bg-background">
      <Nav />
      <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Logo variant="wordmark-offwhite" className="h-12 w-auto sm:h-14" />
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            For students
          </p>
        </div>

        {/* Progress bar */}
        <div className="mb-3">
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-secondary/50"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label={`Signup progress: step ${stepIndex + 1} of ${total}`}
          >
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p
            className="mt-2 text-xs font-medium text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            Step {stepIndex + 1} of {total}
          </p>
        </div>

        {/* Step tabs — reached steps are clickable */}
        <ol
          className="hide-scrollbar mb-6 flex gap-2 overflow-x-auto pb-1"
          aria-label="Signup steps"
        >
          {steps.map((s, idx) => {
            const done = idx < stepIndex;
            const current = idx === stepIndex;
            const reachable = idx <= maxReached;
            return (
              <li key={s.key} className="shrink-0">
                <button
                  type="button"
                  onClick={() => reachable && onJump(idx)}
                  disabled={!reachable}
                  aria-current={current ? "step" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium transition",
                    current && "border-primary bg-primary text-primary-foreground",
                    !current && done && "border-primary/40 bg-secondary/40 text-foreground",
                    !current &&
                      !done &&
                      reachable &&
                      "border-border bg-background text-muted-foreground hover:border-primary/40",
                    !reachable &&
                      "cursor-not-allowed border-border bg-background text-muted-foreground/50",
                  )}
                >
                  {done ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <span className="tabular-nums">{idx + 1}</span>
                  )}
                  <span>{s.label}</span>
                </button>
              </li>
            );
          })}
        </ol>

        {/* Step card */}
        <section className="animate-fade-up rounded-2xl bg-card p-6 shadow-card sm:p-8">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="font-display text-2xl font-semibold text-foreground outline-none sm:text-3xl"
          >
            {title}
          </h1>
          {hint && <p className="mt-1.5 text-sm font-light text-muted-foreground">{hint}</p>}
          <div className="mt-6">{children}</div>
        </section>

        {/* Nav buttons */}
        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={!onBack}
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-secondary/40 disabled:invisible"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={nextDisabled || nextLoading}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-7 py-3 text-sm font-semibold text-primary-foreground shadow-card transition hover:-translate-y-0.5 hover:opacity-95 disabled:translate-y-0 disabled:opacity-60"
          >
            {nextLoading ? "Working…" : nextLabel}
            {!nextLoading && <ArrowRight className="h-4 w-4" />}
          </button>
        </div>
      </main>
      <Footer />
    </div>
  );
}
