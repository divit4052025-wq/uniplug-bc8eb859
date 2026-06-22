// Student-signup v2 — the persistent reactive Founder companion that sits beside
// every form step. It is kept mounted across scene changes by the orchestrator
// (its parent never unmounts), so it reads as one continuous character rather
// than re-appearing each step. Reactivity is purely prop-driven: the orchestrator
// passes a MascotExpression that maps to the current scene + interaction
// (thinking on focus, confused on error, celebrating on grade-pick, etc.).
// Artwork is the canonical in-repo <Mascot> — never altered here.
import { Mascot, type MascotExpression } from "@/components/mascots/Mascot";
import { MASCOTS } from "@/components/mascots/mascot-data";

export function FounderCompanion({
  expression,
  size = 168,
  className,
}: {
  expression: MascotExpression;
  size?: number;
  className?: string;
}) {
  return (
    <div className={className} aria-hidden>
      <Mascot
        shape="founder"
        color={MASCOTS.founder.color}
        expression={expression}
        size={size}
        decorative
      />
    </div>
  );
}
