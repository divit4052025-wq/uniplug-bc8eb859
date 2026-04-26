
# Make the hero wordmark scale freely with tagline always flush below

## Problem (diagnosed by inspecting the asset)
The `wordmark-dark.png` is a 2000×2000 image, but the actual "UniPlug." glyphs occupy only **y=752 → y=1069** — about **15.85% of the image's height in the middle**, with ~38% empty padding above and ~47% below.

That's why:
- Every time we resize the logo, the tagline floats off into space.
- The current hardcoded `-mt-[110px]` only works at exactly `h-[420px]`.
- Pushing the logo to e.g. 1000px tall makes the visible glyphs ~158px and leaves ~470px of invisible padding below them — which the negative margin can't reliably bridge across sizes.

## Goal
You can set the hero wordmark to any visual size (240px, 500px, 1000px+) and the tagline always sits ~24px below the actual letters automatically — no hand-tuned magic numbers.

## Approach: clip the whitespace with a sized wrapper
Wrap `<Logo />` in a `div` whose height equals the desired *visible* wordmark height. Make the inner image ~6.31× taller (since glyphs = 15.85% of the PNG) and center it so the glyphs land in the wrapper. `overflow: hidden` clips the transparent padding on all sides.

### Implementation in `src/routes/index.tsx`
Replace the current hero block (~lines 114-119):
```tsx
<Logo variant="wordmark-dark" className="h-[420px] w-auto max-w-full" />
<p className="-mt-[110px] max-w-xl text-[18px] font-light text-[#E8C4B8]">
  Connect with students already living your dream.
</p>
```

With a cropped wrapper:
```tsx
{/* Visible wordmark height — change ONE number to resize */}
<div
  className="relative overflow-hidden"
  style={{ height: "240px", width: "min(90vw, 1200px)" }}
  aria-hidden
>
  <Logo
    variant="wordmark-dark"
    className="absolute left-1/2"
    style={{
      // PNG glyphs are 15.85% of image height (317/2000).
      // Image height = visible height / 0.1585  →  240 / 0.1585 ≈ 1514px
      height: "1514px",
      maxWidth: "none",
      width: "auto",
      top: "50%",
      // Glyph vertical center sits at 45.5% of the PNG (not 50%), so nudge up ~4.5%.
      transform: "translate(-50%, calc(-50% - 4.5%))",
    }}
  />
</div>

<p className="mt-6 max-w-xl text-[18px] font-light text-[#E8C4B8]">
  Connect with students already living your dream.
</p>
```

`height: "240px"` becomes the only knob. Want it at 500px? Set `height: "500px"` and `height: "3155px"` for the inner image (500 / 0.1585). I'll also drop in a small comment explaining the formula so future resizes are obvious.

I'll default it to **240px** (a comfortable, premium hero size for desktop). If you'd rather start much bigger (e.g., 500px or 800px), tell me before I implement and I'll set it directly.

## Why this is better than negative margins
- Tagline gap is real CSS spacing (`mt-6` = 24px), measured from the letters — not from invisible pixels.
- Resizing requires changing one value, not re-tuning a negative margin.
- Same pattern is reusable later for the footer or auth-page wordmark if you want.

## Verification after implementation
At the current 1376×924 viewport I'll confirm:
- Glyphs render sharp and fully visible (not clipped horizontally).
- Tagline sits ~24px below the visible baseline.
- Hero remains vertically centered.

## Files touched
- `src/routes/index.tsx` — only the wordmark + tagline JSX in the hero section.

## Out of scope
- Not editing the PNG asset (a pre-cropped asset would be a cleaner long-term fix; possible follow-up).
- Not touching nav, footer, or other sections.
- Not changing brand colors, typography, or button styles.
