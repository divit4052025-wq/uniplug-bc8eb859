// Ambient types for the Cloudflare Workers runtime `env` used by server code in
// PRODUCTION (the worker binding is reached via a dynamic `import("cloudflare:workers")`
// in src/lib/waitlist/store.server.ts). In local `vite dev` the Cloudflare
// plugin is build-only, so the store falls back to wrangler's getPlatformProxy;
// see store.server.ts.
//
// `env.DB` is the waitlist D1 binding (see wrangler.jsonc) — a SEPARATE store
// from Supabase that never touches the hosted Supabase project. String secrets
// (SUPABASE_*, RESEND_*, LAUNCH_MODE, …) live on process.env via nodejs_compat
// and are unaffected by this declaration.
declare module "cloudflare:workers" {
  export const env: {
    DB: import("./lib/waitlist/d1-types").D1Database;
    [key: string]: unknown;
  };
}
