## Smart `<Logo>` component that auto-crops the PNG whitespace

### The problem (measured, not guessed)
Every logo PNG is 2000×2000 with the actual glyphs taking up only a small portion of the canvas:

| Asset | Glyph height % | Glyph width % | Vertical center |
|---|---|---|---|
| umark-offwhite | 34.0% | 42.4% | ~50% |
| umark-dark | 34.4% | 43.0% | ~50% |
| umark-sand | 34.4% | 42.9% | ~50% |
| umark-rose | 34.1% | 42.5% | ~50% |
| umark-blush | 58.1% | 58.1% | 50% |
| wordmark-dark | 15.85% | 60.45% | 45.52% |
| wordmark-offwhite | 15.75% | 59.90% | 50.08% |
| wordmark-sand | 16.00% | 60.75% | 46.10% |
| wordmark-blush | 15.75% | 60.00% | 42.98% |

So when the nav uses `h-[60px]`, the **visible** "U" is only ~20px and the nav bar is bloated by ~40px of invisible padding on top + bottom. Same root cause as the hero wordmark issue.

### The fix
Encode each asset's glyph ratio + center offset directly in `src/components/site/Logo.tsx`, and have the component render an `overflow-hidden` wrapper sized to the visible glyph, with the actual `<img>` scaled and translated so the glyph lands inside it. Callers go back to writing simple sizes — no magic numbers anywhere else.

### New `<Logo>` API

```tsx
<Logo variant="umark-offwhite" size={40} />     // 40px visible glyph height
<Logo variant="wordmark-dark" size={240} />     // 240px visible glyph height
<Logo variant="umark-dark" size={36} />         // sidebar
```

- `size` = visible glyph **height** in pixels (matches brand rules: nav 40, sidebar 36, hero/footer 48 — except the hero where you're using a larger custom value).
- Width auto-derives from glyph aspect ratio so the wrapper doesn't include side padding either.
- Internally: `imageHeight = size / glyphHeightRatio`, then `transform: translate(-50%, calc(-50% + offset))` to center the glyph inside the wrapper.
- `className` still works for things like extra margins.

### Files to change

**1. `src/components/site/Logo.tsx`** — replace the current implementation:
- Add a `GLYPH_METRICS` table with the measured `{ hRatio, wRatio, centerYPct }` for each variant.
- Render `<div style={{ height: size, width: size * (wRatio/hRatio), overflow:'hidden', position:'relative' }}>` wrapping an absolutely-positioned `<img>`.
- Keep the `variant` and `className` props. Add `size?: number` (default 40). Drop the raw `style` escape hatch we added last round (no longer needed).

**2. `src/components/site/Nav.tsx`** — change `<Logo variant="umark-offwhite" className="h-[60px] w-auto" />` to `<Logo variant="umark-offwhite" size={60} />`. Nav bar will shrink back to a sensible height because the surrounding padding now wraps real pixels, not whitespace.

**3. `src/routes/index.tsx`** — replace the manual cropping wrapper around the hero wordmark with the new clean call: `<Logo variant="wordmark-dark" size={240} />`. Same visual result, ~10 lines of CSS hackery deleted. Tagline keeps its `mt-6 -translate-x-12`.

### Other call sites I'll audit and update in the same pass
I'll grep for every `<Logo` usage and migrate them so nothing renders with the old `className="h-X"` API:
- `src/components/dashboard/DashboardSidebar.tsx`
- `src/components/dashboard/DashboardTopbar.tsx`
- `src/components/dashboard/MobileBottomNav.tsx`
- `src/components/mentor-dashboard/MentorSidebar.tsx`
- `src/components/mentor-dashboard/MentorMobileNav.tsx`
- `src/components/site/AuthShell.tsx`
- `src/components/site/Footer.tsx`

For each, I'll pick the `size` that matches the brand-rule guidance (nav/topbar 40, sidebar 36, footer wordmark 48, auth wordmark 48, mobile nav 28).

### What this gets you
- Nav bar height returns to normal — chrome is sized to the *real* logo, not a 2000px transparent square.
- One number controls each logo's visible size, anywhere in the app.
- Hero wordmark code becomes 1 line instead of a 10-line wrapper.
- Future asset swaps only require updating one row in `GLYPH_METRICS`.

### Out of scope
- Not editing the PNG assets themselves.
- Not changing brand colors, copy, or layout beyond what's needed to swap the API.
- Not touching the favicon or any non-`<Logo>` image.

### Verification after implementation
At 1376×924 I'll visually confirm:
- Nav bar height looks right (no extra padding from invisible whitespace).
- Hero wordmark + tagline still positioned exactly as they are now.
- Sidebar, footer, and auth pages still render their logos crisp and at the brand sizes.