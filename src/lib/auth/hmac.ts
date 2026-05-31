import { createHmac, timingSafeEqual } from "node:crypto";

const MIN_SECRET_LENGTH = 16;

/**
 * Constant-time HMAC-SHA256 verification for Razorpay webhooks.
 *
 * Razorpay signs the webhook with `HMAC-SHA256(rawBody, webhookSecret)` and
 * sends the hex digest in the `x-razorpay-signature` header. We MUST hash the
 * RAW request bytes (not a re-serialized JSON object) — re-encoding can change
 * key order / whitespace and break the signature. So the caller passes the exact
 * string from `await request.text()`.
 *
 * Mirrors the fail-closed discipline of `bearerOk` (src/lib/auth/bearer.ts):
 * - missing/short secret → false (a misconfigured secret never grants access);
 * - missing signature header → false;
 * - length-compare before `timingSafeEqual` (which requires equal-length
 *   buffers); the length comparison leaks only length, never the digest bytes.
 *
 * Phase Payments-3 (2026-05-31): introduced for /api/public/hooks/razorpay-webhook.
 */
export function hmacOk(
  rawBody: string,
  signature: string | null,
  secret: string | undefined,
): boolean {
  if (!secret) return false;
  if (secret.length < MIN_SECRET_LENGTH) return false;
  if (!signature) return false;

  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  if (signature.length !== expected.length) return false;

  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
