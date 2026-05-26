/**
 * Single FROM source for every transactional email Uniplug sends.
 *
 * Phase C (2026-05-23): scaffolded for full Resend integration. Sending
 * domain DNS is not yet verified, so this is the Resend-provided default
 * `onboarding@resend.dev` which works without DNS. When Divit verifies
 * the uniplug.app DNS records (SPF, DKIM) on Resend, flip this constant
 * to `noreply@uniplug.app` (or whatever the chosen From address is) and
 * deploy — no other code change needed.
 *
 * TODO(divit): replace `onboarding@resend.dev` with the verified
 * uniplug.app sender once DNS records land at Resend. ENV.md tracks the
 * status of this swap.
 */
export const FROM = "UniPlug <onboarding@resend.dev>";
