/**
 * Single FROM source for every transactional email Uniplug sends via Resend
 * (the app's event-email Worker route — distinct from Supabase Auth's own SMTP
 * sender, which is configured in the Supabase dashboard).
 *
 * 2026-05-30: flipped to the verified `uniplug.app` sender. This constant is the
 * single source of FROM for every Resend send in
 * src/routes/api/public/hooks/send-event-email.ts (including the parental-consent
 * email). No env indirection — change here, deploy, done.
 *
 * Prod dependency (operator, not code): the uniplug.app domain must be verified
 * on Resend (SPF/DKIM) and the RESEND_API_KEY Worker secret set for sends to
 * succeed. ENV.md tracks status.
 */
export const FROM = "UniPlug <noreply@uniplug.app>";
