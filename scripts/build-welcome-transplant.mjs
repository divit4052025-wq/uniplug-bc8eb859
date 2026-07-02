// Deterministic transplant of the approved UniPlug landing design into /welcome.
//
// This is the "automated prefixing step" — run it to (re)generate the two
// committed artifacts from the design source. It does NOT rewrite the design's
// HTML/CSS/JS by hand; it mechanically:
//   1. extracts the design's inner <body> markup, strips the <script> tags,
//      rewrites asset paths to /welcome-design/…, and rewires the two CTAs
//      (data-panel-link 2 → /student-signup, 3 → /mentor-signup) — changing only
//      link targets, not text/markup;
//   2. concatenates css/base.css + css/components.css and prefixes EVERY selector
//      with #uniplug-welcome (mapping html/body/:root/* to the container) via
//      postcss-prefix-selector, so the design's CSS can never leak to other
//      routes, then appends a tiny override so the container stays overflow:visible
//      (protecting the sticky pinned-scroll) and box-sizing:border-box.
//
// The raw design files (app.js, mascots.js, css/, assets/) are copied to
// public/welcome-design/ separately (see the PR notes) — including the
// de-collided lowercase letter wm-lower-u.png.
//
// Usage: node scripts/build-welcome-transplant.mjs
//   (requires the design unzipped at ~/Downloads/UniPlug_LandingPage_Final/)

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import postcss from "postcss";
import prefixer from "postcss-prefix-selector";

const DESIGN = join(homedir(), "Downloads", "UniPlug_LandingPage_Final");
const REPO = process.cwd();
const PREFIX = "#uniplug-welcome";

// ---------------------------------------------------------------------------
// 1. MARKUP — extract inner <body>, strip scripts, rewrite assets + CTAs
// ---------------------------------------------------------------------------
const html = readFileSync(join(DESIGN, "UniPlug Landing.html"), "utf8");
const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
if (!bodyMatch) throw new Error("Could not find <body> in the design HTML");
let body = bodyMatch[1];

// strip the trailing <script src=…> tags — they don't run via innerHTML and are
// loaded as real client scripts by the route instead.
body = body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");

// rewrite asset paths → /welcome-design/assets/… (lowercase-u letter was
// de-collided to wm-lower-u.png when copied into public/).
body = body.replace(/(["'])assets\/wm-u\.png\1/g, "$1/welcome-design/assets/wm-lower-u.png$1");
body = body.replace(/(src|href)=(["'])assets\//g, "$1=$2/welcome-design/assets/");

// rewire the two CTAs. For each <a … data-panel-link="2|3" …>, drop any existing
// href + the data-panel-link attribute and set the real signup route href.
// Text and inner markup (the › arrow span) are untouched.
body = body.replace(/<a\b([^>]*?)\sdata-panel-link="([23])"([^>]*)>/gi, (_m, pre, n, post) => {
  const attrs = (pre + post).replace(/\shref="[^"]*"/gi, "");
  const route = n === "2" ? "/student-signup" : "/mentor-signup";
  return `<a${attrs} href="${route}">`;
});

const guard = body.match(/data-panel-link/);
if (guard) throw new Error("CTA rewire incomplete — a data-panel-link survived");

// TASK 1 — add a "Login" button as the FIRST item in the header actions cluster
// (order: Login | Become the Plug you needed | Find your Plug →). Real anchor →
// SPA nav + no-JS both work; no data-panel-link so app.js does not intercept it.
// Styled by the appended .hbtn-login rule (rose fill, ink text — WCAG AA).
const beforeLogin = body.length;
body = body.replace(
  /<div class="pill pill-actions">/,
  '<div class="pill pill-actions"><a class="hbtn hbtn-login magnetic" href="/login">Login</a>',
);
if (body.length === beforeLogin) throw new Error("Login inject failed — .pill-actions not found");

// TASK 2 — remove the dev "Tweaks" FAB + panel (must not ship to real visitors).
// The tweaks markup is the last block before the (already-stripped) scripts, so
// match the comment through the final </div>. app.js's tweaks code is stripped in
// lockstep below (it dereferences these ids without null-guards).
const beforeTw = body.length;
body = body.replace(/<!--\s*=+\s*TWEAKS\s*=+\s*-->[\s\S]*<\/div>/i, "");
if (body.length === beforeTw || /tw-fab|tw-panel/.test(body)) {
  throw new Error("Tweaks markup not removed");
}

// TASK 3 — WAITLIST LAUNCH MODE. Collapse every signup/login CTA to a single
// "Join the waitlist" → /waitlist, in the landing's own button language, so the
// public site has no dead ends while the rest of the app is gated. This mirrors
// the same change hand-applied to the committed welcome-body.html. It runs on
// the markup AFTER TASK 1/2 (Login injected, panel-links rewired to
// /student-signup|/mentor-signup), and subsumes the injected Login. To restore
// the full-signup landing at launch, delete this block and regenerate.
{
  const arr = '<span class="arr">&rarr;</span>';

  // header pill-actions (Login + ghost + solid) → one solid waitlist button.
  const beforeHdr = body.length;
  body = body.replace(
    /<div class="pill pill-actions">[\s\S]*?<\/div>/,
    `<div class="pill pill-actions"><a class="hbtn hbtn-solid magnetic" href="/waitlist">Join the waitlist ${arr}</a>\n  </div>`,
  );
  if (body.length === beforeHdr) throw new Error("waitlist: header pill-actions not collapsed");

  // mobile nav-sheet → one waitlist link.
  const beforeNav = body.length;
  body = body.replace(
    /<div class="nav-sheet"([^>]*)>[\s\S]*?<\/div>/,
    `<div class="nav-sheet"$1>\n  <a href="/waitlist">Join the waitlist</a>\n</div>`,
  );
  if (body.length === beforeNav) throw new Error("waitlist: nav-sheet not collapsed");

  // closing panel c-cta (two role buttons) → one primary waitlist button.
  const beforeCta = body.length;
  body = body.replace(
    /<div class="c-cta([^"]*)">[\s\S]*?<\/div>/,
    `<div class="c-cta$1">\n          <a class="btn btn-primary btn-lg magnetic" href="/waitlist">Join the waitlist ${arr}</a>\n        </div>`,
  );
  if (body.length === beforeCta) throw new Error("waitlist: closing c-cta not collapsed");

  if (/\/login|\/student-signup|\/mentor-signup/.test(body)) {
    throw new Error("waitlist: a signup/login CTA survived the collapse");
  }
}

mkdirSync(join(REPO, "src/welcome-design"), { recursive: true });
writeFileSync(join(REPO, "src/welcome-design/welcome-body.html"), body.trim() + "\n", "utf8");
console.log("✓ markup → src/welcome-design/welcome-body.html");

// ---------------------------------------------------------------------------
// 2. CSS — concat + prefix every selector under #uniplug-welcome
// ---------------------------------------------------------------------------
const css =
  readFileSync(join(DESIGN, "css/base.css"), "utf8") +
  "\n" +
  readFileSync(join(DESIGN, "css/components.css"), "utf8");

const result = postcss([
  prefixer({
    prefix: PREFIX,
    transform(prefix, selector, prefixedSelector, _filePath, rule) {
      // never touch selectors inside @keyframes (0%/from/to)
      let p = rule && rule.parent;
      while (p) {
        if (p.type === "atrule" && /keyframes/i.test(p.name)) return selector;
        p = p.parent;
      }
      if (selector === ":root" || selector === "html" || selector === "body") return prefix;
      if (selector === "*") return `${prefix} *`;
      // body…/html… (state classes, :not(), descendants) → swap the leading
      // element for the container so app.js's body-class toggles (mirrored onto
      // the container at runtime) match.
      if (/^body\b/.test(selector)) return selector.replace(/^body\b/, prefix);
      if (/^html\b/.test(selector)) return selector.replace(/^html\b/, prefix);
      return prefixedSelector; // default: "#uniplug-welcome <selector>"
    },
  }),
]).process(css, { from: undefined });

const scoped =
  result.css +
  `\n\n/* transplant overrides: keep the container a normal-flow, non-scrolling,\n   border-box block so the design's position:sticky pinned scroll resolves\n   against the page (not the container) and box-sizing applies to the root. */\n` +
  `${PREFIX}{box-sizing:border-box;overflow:visible}\n${PREFIX} *{box-sizing:border-box}\n` +
  // TASK 1 — Login button: same .hbtn shape/height/font as the others, same
  // padding as .hbtn-solid; only colour differs (rose fill, ink text; hover
  // darkens to rose-deep, consistent with the solid button). ink-on-rose ≥ AA.
  `\n/* Login button */\n` +
  `${PREFIX} .hbtn-login{background:var(--rose);color:var(--ink);padding:11px 19px}\n` +
  `${PREFIX} .hbtn-login:hover{background:var(--rose-deep);color:var(--ink)}\n` +
  // Waitlist UI fixes (2026-07-02) — mirrors the same overrides hand-applied to
  // the committed welcome.scoped.css so a regen stays consistent.
  //   A1 — hide the founder-quote radial glow (the pinned-scroll transform
  //        drops it into the panel's bottom-right, bleeding a warm corner glow
  //        onto the dark panel; decorative + aria-hidden, mascot keeps its halo).
  //   B3 — the single "Join the waitlist" CTA in .pill-actions: drop the frosted
  //        cluster chrome so the solid button reads as one clean header pill,
  //        matched to the logo pill's 48px height + shadow (desktop only —
  //        .pill-actions is display:none < 860px).
  `\n/* Waitlist UI fixes (2026-07-02) */\n` +
  `${PREFIX} .panel-quote .quote-glow{display:none}\n` +
  `${PREFIX} .pill-actions{background:none;border:none;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;padding:0;gap:0}\n` +
  `${PREFIX} .pill-actions .hbtn-solid{height:48px;padding:0 24px;box-shadow:0 6px 22px -14px rgba(26,26,26,.4)}\n`;

mkdirSync(join(REPO, "public/welcome-design"), { recursive: true });
writeFileSync(join(REPO, "public/welcome-design/welcome.scoped.css"), scoped, "utf8");
console.log("✓ scoped css → public/welcome-design/welcome.scoped.css");

// ---------------------------------------------------------------------------
// 3. app.js — copy with the dev "Tweaks" block stripped (TASK 2). The block runs
//    from its banner comment to just before the final onScroll(); nothing after
//    it depends on its locals, so removing it is clean.
// ---------------------------------------------------------------------------
let appjs = readFileSync(join(DESIGN, "app.js"), "utf8");
const beforeApp = appjs.length;
appjs = appjs.replace(/\/\*[\s=]*TWEAKS[\s=]*\*\/[\s\S]*?(?=\n\s*onScroll\(\);)/, "\n");
if (appjs.length === beforeApp || /twFab|ACCENTS|twReplay/.test(appjs)) {
  throw new Error("app.js TWEAKS block not stripped");
}
writeFileSync(join(REPO, "public/welcome-design/app.js"), appjs, "utf8");
console.log("✓ app.js (tweaks stripped) → public/welcome-design/app.js");
console.log("done.");
