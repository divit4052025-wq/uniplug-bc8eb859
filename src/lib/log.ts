/**
 * Lightweight structured logger (Phase: observability skill).
 *
 * Uniplug has no Sentry / Datadog yet — what it has is `console.*` landing in
 * Cloudflare Workers logs (and the browser). This wrapper enforces one stable
 * JSON shape so logs are queryable now and can be piped into a real telemetry
 * tool later WITHOUT touching call sites. No SDK, no dependency — by design.
 *
 * Shape: { ts, level, surface, event, alert?, ...non-PII fields }.
 * NEVER log PII (emails, phones, names, document/note/review bodies, secrets).
 * UUIDs (user_id / student_id / booking_id / ...) are fine — pseudonymous join keys.
 *
 * `alert: true` flags a failure that should page once monitoring is wired. See
 * the migration note in `error()` — that's the single place a future
 * Sentry/CF-telemetry capture slots in, so no call site changes when it lands.
 */

type Level = "debug" | "info" | "warn" | "error";

export interface LogFields {
  surface: string; // 'worker' | 'web' | 'cron' | 'edge-fn' | ...
  event: string; // short verb_noun handle, e.g. 'consent_email_send_failed'
  alert?: boolean; // failures that should page once a monitor exists
  // ...arbitrary additional NON-PII fields
  [key: string]: unknown;
}

function emit(level: Level, fields: LogFields): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/**
 * Heuristic: does a Supabase Auth error look like an email-SEND (SMTP) failure
 * rather than a validation error (bad password, user exists, etc.)? Used to set
 * `alert: true` only on genuine auth email-delivery failures — the class that
 * silently strands a user mid-signup/reset. Errs toward matching the known
 * GoTrue phrasings ("Error sending confirmation email", recovery email, SMTP).
 */
export function looksLikeEmailSendFailure(message: string | undefined | null): boolean {
  if (!message) return false;
  return /error sending|sending (a )?(confirmation|recovery|magic|invite|reset)|failed to send|smtp/i.test(
    message,
  );
}

export const log = {
  debug: (fields: LogFields) => emit("debug", fields),
  info: (fields: LogFields) => emit("info", fields),
  warn: (fields: LogFields) => emit("warn", fields),
  error: (fields: LogFields) => {
    emit("error", fields);
    // ── MIGRATION POINT (approval-gated) ─────────────────────────────────────
    // When an error-monitoring integration is approved + its DSN is set as a
    // Worker secret, add the single capture call HERE so every log.error /
    // alert:true surfaces as a real alert without touching any call site, e.g.:
    //
    //   if (fields.alert && globalThis.SENTRY_DSN) {
    //     Sentry.captureException(new Error(String(fields.event)), { extra: fields });
    //   }
    //
    // Intentionally NOT wired yet — no monitoring SDK is set up (see
    // observability skill: "no SDK dependencies yet").
  },
};
