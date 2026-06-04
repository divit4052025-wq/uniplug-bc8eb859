// P7 — the "finish your profile" gate shared by the dashboard (redirect/nudge)
// and the finalize step (skip). An authenticated student with
// profile_completed_at IS NULL is routed to /student-signup/finalize; "Skip for
// now" sets a per-session flag so the dashboard shows a soft nudge banner
// instead of redirecting again (no loop, never traps a legacy/backfill user).
export const FINALIZE_SKIP_KEY = "uniplug:finalize-skipped";

export function finalizeSkippedThisSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(FINALIZE_SKIP_KEY) === "1";
  } catch {
    return false;
  }
}
