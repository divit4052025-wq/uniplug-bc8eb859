# LAUNCH_MODE — waitlist launch gate

UniPlug ships behind a single production flag, **`LAUNCH_MODE`**, so the public
site can run in "waitlist" mode (landing + waitlist only) while the full app
stays exactly as-is locally. The gate is a global TanStack Start **request
middleware** in [`src/start.ts`](../src/start.ts) — it runs on the Cloudflare
Worker before routing, on every request, and works with JavaScript off.

## Values

`LAUNCH_MODE` is read from `process.env.LAUNCH_MODE` (a plain Worker env var,
available via `nodejs_compat`).

| Value               | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `waitlist`          | Public launch mode. Only the landing (`/`, `/welcome`) and the waitlist flow (`/waitlist`, `/waitlist/student`, `/waitlist/mentor`) render. Any other **page** navigation → `302` to `/`. Any other **app API / server function** (`/api/*`, server-fn base) → `404`, so nothing behind the gate — dashboards, browse, login, signup, admin, bookings, emails — is reachable. Static assets, code-split chunks, `/welcome-design/*`, and the waitlist endpoints (`/api/public/waitlist/*`) always pass. |
| `full` or **unset** | `next()` for everything — the entire app works exactly as it does today. **This is the local-dev default** (nothing is hidden locally).                                                                                                                                                                                                                                                                                                                                                                 |

## Where it is set

- **Local dev:** leave it **unset**. `vite dev` has no `LAUNCH_MODE`, so the gate
  is a no-op and the full app runs. Do **not** add it to `wrangler.jsonc` `vars`
  or `.dev.vars` (that would gate local dev too).
- **Production Worker:** set it on the deployed Worker only. Either
  - Cloudflare dashboard → the Worker → **Settings → Variables and Secrets** →
    add a plaintext variable `LAUNCH_MODE = waitlist`, redeploy; or
  - at deploy time: `wrangler deploy --var LAUNCH_MODE:waitlist`.

## Flipping to full launch later

1. Remove the `LAUNCH_MODE` variable from the production Worker (or set it to
   `full`).
2. Redeploy. Every route is reachable again; the landing's "Join the waitlist"
   CTAs still work (they point at real `/waitlist*` routes) but you'll typically
   restore the original signup CTAs — see below.
3. To restore the original landing CTAs (Login / signup), delete the
   "TASK 3 — WAITLIST LAUNCH MODE" block in
   [`scripts/build-welcome-transplant.mjs`](../scripts/build-welcome-transplant.mjs)
   and regenerate, or revert `src/welcome-design/welcome-body.html`.

## Waitlist data store (Cloudflare D1)

The waitlist uses a **separate Cloudflare D1 database** (`uniplug-waitlist`,
binding `DB` in `wrangler.jsonc`) — it is **not** Supabase and never touches the
hosted Supabase project. Server code reads it via
`import { env } from "cloudflare:workers"` → `env.DB` (an object binding, so it
is not on `process.env`).

Apply the migration to each environment:

```bash
# local dev (miniflare SQLite under .wrangler/state)
wrangler d1 migrations apply uniplug-waitlist --local

# production (the remote D1)
wrangler d1 migrations apply uniplug-waitlist --remote
```

Endpoints (both allowlisted in waitlist mode):

- `POST /api/public/waitlist/submit` — `{ name, email, kind: "school"|"college" }`.
  Validates + normalises (email lowercased/trimmed), UPSERTs by email (a repeat
  submission never inflates the count), returns the person's real, stable
  position.
- `GET /api/public/waitlist/counts` — real `{ school, college }` counts, grouped
  by kind. Nothing is seeded or padded; a side with no signups returns `0`.
