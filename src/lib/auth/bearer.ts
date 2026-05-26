import { timingSafeEqual } from "node:crypto";

const MIN_SECRET_LENGTH = 16;

/**
 * Constant-time Bearer-token check for service-to-service POST endpoints
 * (pg_cron callers, Razorpay webhooks once wired, etc.).
 *
 * - Returns `false` for missing/falsy `expected` so a missing env var
 *   never silently grants access.
 * - Returns `false` for `expected` shorter than 16 chars so a misconfig
 *   (`wrangler secret put CRON_SECRET hunter2`) fails closed rather
 *   than accepting a guessable token.
 * - The scheme compare is intentionally case-sensitive ("Bearer "); our
 *   internal callers always send that exact prefix. RFC 6750 §2.1
 *   permits case-insensitive, but rejecting variants from third parties
 *   is harmless tightening.
 * - Length-compares before `timingSafeEqual` because that fn requires
 *   equal-length buffers. The length comparison itself leaks length but
 *   never the secret bytes.
 *
 * Phase A3 (2026-05-23) introduced this helper for /api/public/hooks/
 * send-reminders; future internal POST endpoints should reuse it rather
 * than re-rolling.
 */
export function bearerOk(header: string | null, expected: string | undefined): boolean {
  if (!expected) return false;
  if (expected.length < MIN_SECRET_LENGTH) return false;
  if (!header?.startsWith("Bearer ")) return false;
  const token = header.slice("Bearer ".length);
  if (token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}
