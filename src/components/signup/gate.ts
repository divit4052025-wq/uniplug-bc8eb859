// Generic per-session "skip the finalize step" flag, shared by the student +
// mentor finalize gates. The redirect gate (dashboard) routes an incomplete
// user to finalize; "Skip for now" sets this flag so they reach their dashboard
// with a soft nudge instead of being redirected again (no loop, never traps).

export function skippedThisSession(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function markSkippedThisSession(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    /* no-op */
  }
}

export function clearSkippedThisSession(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    /* no-op */
  }
}
