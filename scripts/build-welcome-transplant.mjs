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
  `${PREFIX}{box-sizing:border-box;overflow:visible}\n${PREFIX} *{box-sizing:border-box}\n`;

mkdirSync(join(REPO, "public/welcome-design"), { recursive: true });
writeFileSync(join(REPO, "public/welcome-design/welcome.scoped.css"), scoped, "utf8");
console.log("✓ scoped css → public/welcome-design/welcome.scoped.css");
console.log("done.");
