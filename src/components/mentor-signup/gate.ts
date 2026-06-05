// P8 — the mentor "finish your application" gate key + helper, delegating to the
// shared generic session-skip helper. mentor-dashboard imports these to route an
// authenticated mentor: pending & not-submitted → finalize (with a per-session
// "skip" escape so they're never trapped).
import { skippedThisSession } from "@/components/signup/gate";

export const MENTOR_FINALIZE_SKIP_KEY = "uniplug:mentor-finalize-skipped";

export function mentorFinalizeSkippedThisSession(): boolean {
  return skippedThisSession(MENTOR_FINALIZE_SKIP_KEY);
}
