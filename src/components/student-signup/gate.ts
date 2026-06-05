// P7 — the student "finish your profile" gate key + helper, delegating to the
// shared generic session-skip helper. dashboard.tsx + FinalizeProfile import
// FINALIZE_SKIP_KEY / finalizeSkippedThisSession from here.
import { skippedThisSession } from "@/components/signup/gate";

export const FINALIZE_SKIP_KEY = "uniplug:finalize-skipped";

export function finalizeSkippedThisSession(): boolean {
  return skippedThisSession(FINALIZE_SKIP_KEY);
}
