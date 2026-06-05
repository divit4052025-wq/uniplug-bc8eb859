// Generic device-local draft store for the signup wizards (the P7 stash pattern):
// a PRE-AUTH wizard stashes the selections that need an authenticated session to
// persist (owner-RLS rows / storage uploads), replayed in the finalize step.
// Role-specific stores (student profile, mentor application) wrap these with
// their own typed payload + storage key.

export function writeDraft(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full / disabled — finalize falls back to fresh collection.
  }
}

export function readDraft<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function removeDraft(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* no-op */
  }
}
