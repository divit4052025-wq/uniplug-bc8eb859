---
name: brand-ui
description: Uniplug design tokens (dusty rose / near-black / off-white, Fraunces + Inter), component patterns (rounded, editorial, no emojis), and accessibility requirements (WCAG AA contrast, keyboard nav, screen reader labels, visible focus rings) — applied to every new or modified UI.
model_class: sonnet
triggers:
  - "Adding or modifying any component in src/components/ or page in src/routes/"
  - "User says: style this, build a component, theme work, design tokens, accessibility"
  - "Before shipping any user-visible change"
allowed-tools: Read, Write, Edit, Grep, Glob
---

# Skill: brand-ui

Uniplug's visual identity is editorial — quiet, slow, deliberate. The opposite of a SaaS dashboard. The brand says: this is a serious decision about your future, not a feed to scroll. Every UI choice runs through that filter.

## Design tokens

| Token | Hex | Where it lives | Use |
| --- | --- | --- | --- |
| Near-black | `#1A1A1A` | `--color-ink` | Body text, headings on light bg, primary buttons |
| Off-white / paper | `#FFFCFB` | `--color-paper` | Page background, card surfaces |
| Dusty rose | `#E8C4B8` | `--color-blush` | Brand accent — outlines, accents, hover states; **never** as body-text bg |
| Sand | `#EDE0DB` | `--color-sand` | Secondary surface — section dividers, muted cards |
| Blush (same as dusty rose) | `#E8C4B8` | `--color-blush` | Decorative — illustrations, dot accents |

Token names live in `tailwind.config.ts` (or the Tailwind v4 config-in-CSS variant — verify before editing). Reference them via Tailwind utilities (`bg-paper`, `text-ink`) — never hex literals in components.

## Type

- **Headings:** Fraunces (serif). Used at 700 weight for h1/h2, 600 for h3+. Tracks tight, not airy.
- **Body:** Inter (sans). 400 regular, 500 for emphasized inline text. Body line-height 1.6 for paragraphs, 1.4 for UI.
- **No third typeface.** No Roboto, no system stack, no monospace except in code blocks (where we use the Tailwind default mono).

Sizes scale on a fixed ramp: 12 / 14 / 16 / 18 / 24 / 32 / 48 / 64 px. Anything between those is a code smell.

## Component patterns

- **Rounded.** Borders use `rounded-xl` (16px) for cards, `rounded-lg` (12px) for buttons and inputs, `rounded-full` for avatars and pill tags. No sharp corners except on horizontal rules.
- **Editorial spacing.** Section padding is generous: `py-16` for sections, `py-8` for card internal padding. Tight, dense data tables are not the aesthetic — they're a last resort for genuinely data-heavy admin views.
- **No emojis.** Anywhere. Not in copy, not in toasts, not in empty states, not in commit messages, not as icon substitutes. Icons come from `lucide-react`.
- **Quiet motion.** Transitions are 200ms ease-out, default. Page transitions are crossfade, not slide. Loading states use a single shimmer/skeleton — no spinners on top of skeletons.
- **One CTA per surface.** Each page has at most one primary button (filled near-black). Everything else is secondary (outlined dusty rose) or tertiary (text-only with underline on hover).

## Accessibility (non-negotiable)

Every PR is held to WCAG 2.1 AA. The checklist:

1. **Contrast.** Body text must hit 4.5:1; UI controls and large text 3:1. Watch the dusty rose accent — `#E8C4B8` against `#FFFCFB` is ~1.4:1 and **fails as body text**. Use it for outlines, illustrations, and decorative blocks only. Body text is always near-black on off-white.
2. **Keyboard navigation.** Every interactive element is reachable via Tab. Focus order matches visual order. Modals trap focus. Escape closes modals.
3. **Visible focus rings.** Never `outline: none` without an `outline:` replacement. The default ring is `ring-2 ring-ink ring-offset-2 ring-offset-paper`. Skipping the offset against the dusty rose accent makes the ring invisible.
4. **Screen reader labels.** Every icon-only button has `aria-label`. Every form field has a `<label>` (Radix's `<Label>` if using shadcn). Decorative icons get `aria-hidden="true"`.
5. **Form errors.** Errors render `aria-live="polite"` with the field's `aria-describedby` pointing at the message. Don't rely on color alone — the error text says what's wrong.
6. **Touch targets.** Minimum 44×44px on mobile (`min-h-11 min-w-11` or 12 = 48px). Avoid icon-only buttons in dense mobile layouts.
7. **Skip link.** `<a href="#main-content">Skip to content</a>` first in the tab order on every layout that has a nav.

## Mobile

Uniplug's primary device is a phone (Indian students applying to global universities). Every component must work at 360px wide. Specifically:

- One-column on mobile, multi-column only at `md:` (768px) and above.
- Modals become bottom sheets at `<md` (use `vaul` or Radix's responsive variants).
- Calendars and date pickers must work without hover (we use `react-day-picker` configured for touch).
- Avoid horizontal scroll *anywhere except* explicit horizontal carousels (`embla-carousel-react`).

## Existing components

shadcn/ui components are pre-installed under `src/components/ui/`. Reuse them — don't roll new variants without a reason. If a Radix primitive needs a custom variant, add it to the existing component file in `src/components/ui/` rather than spawning a parallel component elsewhere.

## Anti-patterns

- **Dusty rose on body text.** Fails contrast. Decorative only.
- **Emojis in toasts.** "Saved! ✅" is not the voice. Just "Changes saved." in a sonner toast.
- **Spinners stacked on skeletons.** Pick one — skeleton if the shape is predictable, spinner if it isn't.
- **Hard-coded hex values in JSX.** Always Tailwind tokens.
- **Tailwind class soup.** When a component has 12+ utility classes on every element, extract a variant with `class-variance-authority` (cva).
- **New typefaces.** Fraunces + Inter, end of story.

## See also

- `playwright-qa` skill — axe scans assert these rules in CI.
- `ux-reviewer` subagent — invokes this skill on every UI PR.
