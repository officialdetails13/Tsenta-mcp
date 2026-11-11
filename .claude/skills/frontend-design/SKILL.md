---
name: frontend-design
description: >-
  Collabo's design system and UI taste rules. Use whenever building or changing
  UI in collabo/web: pages, components, landing sections, forms, cards, motion,
  or when integrating a pasted component (e.g. from 21st.dev). Covers the type
  scale, 8px spacing grid, color tokens, component patterns, Framer Motion
  conventions, accessibility and performance rules, and what to avoid so the
  product never looks like a generic AI-generated site.
---

# Collabo frontend design

Collabo is a marketplace where small businesses hire creators with escrow. The
UI has one job: make money and data feel **trustworthy**. Every design choice
should read as precise, calm and honest. That rules out flashy, vague or
hype-driven choices.

Source of truth for tokens: `collabo/web/src/styles.css` (`:root`, with dark-mode
overrides). Tailwind utilities map to the same tokens (`collabo/web/src/tailwind.css`).
Never hard-code a color, size or duration that has a token.

## Type scale

System font stack (fast, no web-font download). Sizes are tokens:

| token | size | use |
|---|---|---|
| `--text-xs` | 12px | labels, badges, metadata |
| `--text-sm` | 13px | secondary text, table cells, helper text (`.small`) |
| `--text-base` | 15px | body (app); 16px for form inputs (prevents iOS zoom) |
| `--text-lg` | 18px | card and section titles inside the app (h2) |
| `--text-xl` | 20px | lead paragraphs, key stat values |
| `--text-2xl` | 26px | page titles (h1 in the app) |
| `--text-3xl` | 40px | landing section headlines |
| `--text-display` | clamp(40px, 7vw, 72px) | the one hero headline |

- Headings: weight 700–800, letter-spacing −0.02em (display −0.035em), line-height 1.05–1.2.
- Body line-height 1.5; max line length ~65ch for paragraphs.
- Numbers that are compared (money, metrics) use `font-variant-numeric: tabular-nums`.
- One display headline per page. Hierarchy comes from size and weight, not color.

## Spacing: 8px grid

`--space-1` 4px (half step, for tight icon gaps only) · `--space-2` 8 · `--space-3` 12 ·
`--space-4` 16 · `--space-5` 24 · `--space-6` 32 · `--space-7` 48 · `--space-8` 64 · `--space-9` 96.

- Card padding 16–24, gaps between cards 16, section padding 64–96 on the landing page.
- Page gutter 16px on phones. No horizontal scrolling at 320px wide (wide tables scroll in their own wrapper).
- Radius: `--radius-sm` 8 (inputs, chips), `--radius` 14 (cards), `--radius-lg` 20 (hero panels), 999 (pills).

## Color tokens

| token | role |
|---|---|
| `--bg`, `--surface`, `--surface-2` | page, cards, insets |
| `--text`, `--muted`, `--border` | ink, secondary ink, hairlines |
| `--brand` (violet), `--brand-2` (fuchsia accent), `--brand-soft` | primary actions, active states, the single accent |
| `--green`, `--amber`, `--red`, `--blue` (+ `-soft`) | **status only**: verified/paid, warning/demo, error/dispute, info |

- One accent per view. Gradients only on the hero headline and progress fills.
- Status colors always come with an icon or label, never color alone.
- Verified data is green (`src-verified`), self-reported is neutral, demo is amber. Keep this mapping everywhere.
- Every token has a dark-mode value. Check both themes.
- Text contrast: WCAG AA (4.5:1 body, 3:1 large text). Muted text only for secondary info.

## Component patterns

- **Buttons**: `.btn` (primary, one per view), `.btn.secondary`, `.btn.ghost`, `.btn.danger-solid` (destructive confirm only). Sizes `sm`/default/`lg`. States: hover (brightness), active (scale 0.98), focus-visible ring, disabled (55% opacity). Labels are verbs: "Deposit $805 into escrow", not "Submit".
- **Cards**: `.card`. Surface, 1px border, radius 14, padding 18–24. Clickable cards lift 2px on hover and get a brand border.
- **Forms**: label above input; 16px input text; helper text below in `--muted`; errors in `.error` with the fix, not just "invalid".
- **Tables**: right-align numbers (`.num`); totals bold with a top rule; wrap wide tables in `.table-wrap`.
- **Badges/pills**: status pills (`.pill-*`), source badges (`SourceBadge`), tier badges. Never more than two badges side by side.
- **Empty states**: say what's missing and the next action, with a button or link.
- **Money**: always show who pays what and when; fees itemised; never round a total that someone pays.
- **Icons**: `lucide-react`, 16–20px, stroke 2, `aria-hidden` when decorative. No emoji as UI icons in new work.
- **Utility class names**: `cn()` from `web/src/lib/cn.js` (clsx + tailwind-merge) when combining Tailwind classes.

## Motion (Framer Motion)

Use Framer Motion for all animations, imported through `web/src/motion.jsx` (it wraps `LazyMotion` + `domAnimation` and uses `m.*` components, which keeps the bundle small).

- Scroll-triggered **fade-up reveals** for landing sections (`<Reveal>`), once per element.
- **Staggered reveals** for card grids and lists (`<Stagger>` + `<StaggerItem>`, 60–80ms stagger).
- **Hover/tap**: interactive cards lift (`y: -2`), primary CTAs scale 0.98 on tap.
- **Page transitions**: short fade/slide between routes (≤ 200ms). Never block input.
- Durations: `--dur-fast` 150ms (hover), `--dur` 250ms (UI), `--dur-slow` 450ms (reveals). Easing: `--ease` cubic-bezier(.2,.7,.2,1).
- Animate transform and opacity only, never layout properties on large areas.
- Respect `prefers-reduced-motion`: `MotionConfig reducedMotion="user"` is set app-wide; don't override it.
- Motion explains state (something arrived, moved or got confirmed). No looping decoration except subtle hero ambience.

## Integrating a pasted component (21st.dev, shadcn-style)

1. Put it in `web/src/components/` as `.jsx` (strip TypeScript types).
2. Map its colors to our tokens. Tailwind's `bg-background`, `text-foreground`, `bg-primary`, `text-muted-foreground`, `border-border` and `bg-card` already map to Collabo tokens, so most components work unchanged.
3. Replace `framer-motion`'s `motion.*` with `m.*` from `../motion.jsx`.
4. Replace placeholder copy with real Collabo copy. Never keep fake testimonials, logos or numbers.
5. Check it at 390px and 1280px, in light and dark, and with reduced motion.

## Avoid the generic AI aesthetic

- No purple-blue gradient blobs behind everything, no glassmorphism stacks, no neon glow on every card.
- No vague hype copy ("Unlock the power of…", "Revolutionize…", "Seamless", "Next-gen"). Say what happens, with numbers.
- No fake social proof: no invented testimonials, logos, user counts or ratings. Use sourced facts and real product data.
- No centered-everything layouts: align text left in content; center only short hero and CTA blocks.
- No identical three-column grids all the way down. Vary section rhythm (split hero, bento grid, table, accordion).
- No random font sizes, radii or shadows: tokens only. No more than two shadow levels.
- No placeholder images or lorem ipsum in shipped UI.
- Show the real product (actual components, real flows) instead of abstract illustrations.

## Performance and accessibility

- Mobile Lighthouse: performance ≥ 90, accessibility ≥ 95. Run `npm run lighthouse` after building and serving (see `collabo/README.md`).
- Routes are code-split (`React.lazy`); keep the landing page's JS small.
- Images: `loading="lazy"`, explicit width/height or aspect-ratio, `alt` text.
- Every interactive element is keyboard reachable with a visible focus ring; icon-only buttons get `aria-label`.
- Tap targets ≥ 40px on touch screens.
