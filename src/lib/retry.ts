// Retry helper for transient Supabase / network failures (Bug 6.7).
//
// React Query handles retries for queries via the QueryClient defaults
// (see queryClient.ts). Use `withRetry` only for paths outside React
// Query — auth flows, route loaders (beforeLoad), one-off RPCs.

/**
 * Decide whether a Supabase / Postgrest / network error is transient and
 * worth retrying. Returns false for application errors (RLS denials, 4xx,
 * validation failures) that retrying won't fix.
 */
export function isTransient(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const err = error as { code?: string; status?: number; message?: string };

  // Postgrest application errors (RLS, validation) — never retry
  if (typeof err.code === "string" && err.code.startsWith("PGRST")) return false;

  // HTTP status — retry 5xx and status 0 (network blocked); never retry 4xx
  if (typeof err.status === "number") {
    if (err.status === 0) return true;
    if (err.status >= 500) return true;
    if (err.status >= 400) return false;
  }

  // Network errors usually surface as plain Error with characteristic text
  const msg = (err.message ?? "").toLowerCase();
  if (/network|fetch|timeout|aborted|connection|econnreset|enotfound/.test(msg)) return true;

  // Unknown — be conservative
  return false;
}

interface RetryOpts {
  attempts?: number;
  baseMs?: number;
}

/**
 * Wrap a Supabase-shaped call ({ data, error }) with exponential-backoff
 * retry on transient failures. Bails immediately on 4xx / RLS denials.
 *
 * Default: 3 attempts × 200ms × 2^i = max ~1.4s total before giving up.
 */
export async function withRetry<T>(
  fn: () => Promise<{ data: T | null; error: unknown }>,
  opts?: RetryOpts,
): Promise<{ data: T | null; error: unknown }> {
  const attempts = opts?.attempts ?? 3;
  const baseMs = opts?.baseMs ?? 200;
  let last: { data: T | null; error: unknown } = { data: null, error: null };
  for (let i = 0; i < attempts; i++) {
    last = await fn();
    if (!last.error) return last;
    if (!isTransient(last.error)) return last;
    if (i === attempts - 1) break;
    await new Promise((r) => setTimeout(r, baseMs * 2 ** i));
  }
  return last;
}
