// TanStack Start instance — the production "launch mode" gate.
//
// This file is the auto-discovered Start entry (resolved by base name "start"
// from src/). It registers ONE global request middleware that runs on the
// Cloudflare Worker before routing, on every request, with JS off. It pulls in
// NO route code and NO three.js — it only reads process.env.LAUNCH_MODE and the
// URL, so it never bloats the SSR/landing bundle or disturbs code-splitting.
//
// LAUNCH_MODE (a plain Worker env var, read via process.env under nodejs_compat):
//   • "waitlist" → serve ONLY the landing + waitlist; every other page 302s to
//     "/", and every other app API / server-function 404s (so nothing behind
//     the gate — dashboards, booking, emails — is reachable). Static assets and
//     the waitlist endpoints always pass.
//   • unset / "full" → next() for everything: the FULL app runs (local-dev
//     default; nothing is hidden locally).
//
// Flip it, and how, in docs/LAUNCH_MODE.md. See src/routes/api/public/waitlist/*
// for the allowlisted endpoints.

import { createStart, createMiddleware } from "@tanstack/react-start";

/** Exact document routes served in waitlist mode (the landing + waitlist flow). */
const ALLOWED_PATHS = new Set<string>([
  "/",
  "/welcome", // permanent redirect → "/"
  "/waitlist",
  "/waitlist/student",
  "/waitlist/mentor",
]);

/** Path prefixes always allowed in waitlist mode (the waitlist endpoints). */
const ALLOWED_PREFIXES = ["/api/public/waitlist/"];

// Static assets / code-split chunks / design files. These must always pass so
// the landing and the lazy 3D hero can render. Cloudflare's asset layer serves
// most of these before the Worker even runs; this is the defensive backstop.
const ASSET_PREFIXES = ["/welcome-design/", "/assets/", "/_build/", "/favicon"];
const ASSET_EXT_RE = /\.[a-zA-Z0-9]+$/; // e.g. .js .css .png .svg .woff2 .ico .json .map

function isAsset(pathname: string): boolean {
  if (ASSET_EXT_RE.test(pathname)) return true;
  return ASSET_PREFIXES.some((p) => pathname.startsWith(p));
}

function isAllowedDocument(pathname: string): boolean {
  if (ALLOWED_PATHS.has(pathname)) return true;
  return ALLOWED_PREFIXES.some((p) => pathname.startsWith(p));
}

function isApiOrServerFn(pathname: string): boolean {
  if (pathname.startsWith("/api/")) return true;
  const fnBase = process.env.TSS_SERVER_FN_BASE;
  return !!fnBase && pathname.startsWith(fnBase);
}

const launchGate = createMiddleware({ type: "request" }).server(async ({ request, next }) => {
  const mode = process.env.LAUNCH_MODE ?? "full";
  if (mode !== "waitlist") return next();

  const { pathname } = new URL(request.url);

  // Assets first, then the allowlisted landing + waitlist routes/endpoints.
  if (isAsset(pathname) || isAllowedDocument(pathname)) return next();

  // App API / server functions behind the gate → 404 (unreachable, not redirected).
  if (isApiOrServerFn(pathname)) {
    return new Response("Not found", {
      status: 404,
      headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
    });
  }

  // Everything else is an HTML navigation to a gated page → 302 back to "/".
  return new Response(null, {
    status: 302,
    headers: { Location: "/", "Cache-Control": "no-store" },
  });
});

export const startInstance = createStart(() => ({
  requestMiddleware: [launchGate],
}));
