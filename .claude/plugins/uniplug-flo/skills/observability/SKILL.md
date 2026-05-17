---
name: observability
description: Structured logging via console with a consistent field shape (timestamp, level, surface, user_id, request_id), error capture patterns, and migration path to Sentry / CF telemetry. Lightweight by design — no SDK dependencies yet. Tags payments / video / AI as priority instrumentation.
model_class: sonnet
triggers:
  - "Adding logs, error boundaries, or telemetry hooks to a new code path"
  - "User says: add logging, observability, monitoring, instrument"
  - "When debugging a production issue that's hard to reproduce locally"
allowed-tools: Read, Write, Edit, Grep, Glob
---

# Skill: observability

Uniplug doesn't have Sentry, Datadog, or Cloudflare's paid observability suite yet. What it has is `console.*` to Cloudflare Workers logs and the browser. The discipline this skill enforces: every log is structured, every error is captured at the surface boundary, and the log shape is stable enough that we can pipe it into a real telemetry tool later without touching call sites.

## Log shape

Every log is a JSON object with at minimum:

```typescript
{
  ts: string;          // ISO timestamp
  level: 'debug' | 'info' | 'warn' | 'error';
  surface: string;     // 'web' | 'worker' | 'edge-fn' | 'cron' | ...
  event: string;       // a short verb_noun handle: 'booking_created', 'webhook_received'
  user_id?: string;    // auth.uid() when known
  request_id?: string; // a UUID generated at request entry; propagated through call tree
  // ...arbitrary additional fields, but no PII (see below)
}
```

Logging looks like:

```typescript
log.info({
  surface: 'worker',
  event: 'razorpay_webhook_received',
  user_id: booking.user_id,
  request_id: ctx.requestId,
  provider_event_id: event.id,
  booking_id: booking.id,
});
```

A thin wrapper in `src/lib/log.ts` (or `worker/log.ts`) builds the JSON. It's a few lines — no SDK, no dependency.

## What gets logged

**Always:**

- Request entry to any Worker route (level: info).
- Webhook received (level: info) before signature check; success / fail (level: info / error).
- Mutation success / failure on the server side (level: info / error).
- Caught exceptions at boundary handlers (level: error, includes stack).

**Conditionally:**

- React Query mutation `onError` fires (level: warn — the user got a toast, but we want the rate).
- Slow operation (>1s) (level: warn).
- AI feature timing + token cost (level: info — used to monitor budget).

**Never:**

- Email addresses, phone numbers, full names, document contents, session note bodies, review bodies.
- Raw Razorpay payment payloads (they contain PAN-adjacent fields). Log the event ID + ledger row ID.
- Bearer tokens, Worker secrets, or any field that looks like a key.
- Full AI prompt + response bodies. Log token counts and the request ID.

User IDs (UUIDs) are fine to log. They're pseudonymous and serve as the join key when correlating events.

## Error capture at boundaries

Every Worker route handler wraps its body in a single try/catch at the outer boundary:

```typescript
export async function onRequest(ctx: Context) {
  const requestId = crypto.randomUUID();
  try {
    log.info({ surface: 'worker', event: 'request_start', request_id: requestId, path: ctx.request.url });
    const result = await handle(ctx, requestId);
    log.info({ surface: 'worker', event: 'request_end', request_id: requestId, status: 200 });
    return result;
  } catch (err) {
    log.error({
      surface: 'worker',
      event: 'request_failed',
      request_id: requestId,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return new Response('Internal Server Error', { status: 500 });
  }
}
```

On the client, errors bubble up through a single React error boundary at the route layout level. The error boundary logs to console and shows a user-facing error state — never the raw stack.

## Priority-tagged domains

Three areas get the deepest instrumentation today:

1. **Payments.** Every state transition logged, every webhook signature check, every refund initiated → completed delta tracked.
2. **Video / session.** When session video integration ships, every join / leave / disconnect event is logged with the booking ID.
3. **AI.** Every Anthropic API call logged with feature name, token counts, latency, success / fail.

These three are flagged as priority-instrumentation in the migration plan below — when Sentry (or equivalent) lands, these are first.

## Migration path

When we add Sentry / Cloudflare Workers Logpush / similar:

1. The `log.*` wrapper grows a second sink — alongside `console.log`, it ships to Sentry (or wherever).
2. Call sites do not change. The wrapper interface is stable.
3. The JSON shape maps cleanly to Sentry's structured event format — `event` becomes the transaction name, `user_id` becomes `user.id`, etc.

Until then, logs live in:
- **Browser:** the user's devtools console (developer-only visibility).
- **Worker:** `wrangler tail` or the Cloudflare dashboard's real-time logs.

For incidents pre-Sentry: tail the Worker logs, grep by `request_id` or `user_id`, correlate against the timeline.

## Anti-patterns

- **`console.log("here", thing)` without structure.** Useless once the volume grows.
- **Logging PII for "convenience."** Pull it from the DB when you need to triage; don't pre-leak it into logs.
- **Catching errors silently.** A `catch {}` block is a bug. At minimum log the error before swallowing.
- **Stack-trace logging on every request.** Stacks are big; only on actual errors.
- **Different log shapes per surface.** The Worker, the web client, the edge function — all use the same JSON shape.

## See also

- `payments-ledger` skill — priority-instrumentation domain.
- `ai-feature-builder` skill — priority-instrumentation domain.
- `security-audit` skill — surface 4 (PII flows) reviews what's leaking into logs.
