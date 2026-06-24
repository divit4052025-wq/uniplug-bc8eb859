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
  color = MASCOTS.founder.color,
}: {
  expression: MascotExpression;
  size?: number;
  className?: string;
  /**
   * Body fill for the founder. Defaults to the canonical ink (#1A1A1A), which
   * reads on the light student flow. The dark-dominant mentor flow passes the
   * bright on-dark rose (#F4B5AA) so the ink founder isn't invisible on #171513.
   */
  color?: string;
}) {
  return (
    <div className={className} aria-hidden>
      <Mascot shape="founder" color={color} expression={expression} size={size} decorative />
    </div>
  );
}
