# Design

Visual system for Scrawnload's popup. See [PRODUCT.md](PRODUCT.md) for the
strategic brief this serves (register: product, personality: precise &
technical, terminal-native dark mode).

## Theme

Dark is a **committed identity**, not a `prefers-color-scheme` fallback —
`:root { color-scheme: dark; }` and there is no light variant. This was a
deliberate choice (confirmed with the user) matching the "terminal-native
dev tool" personality, the same way Vercel, Raycast, or Warp commit to dark
rather than adapting to OS preference.

## Color

All tokens in OKLCH, defined in [popup.css](popup.css). Contrast was
computed (not eyeballed) via a standalone OKLab→linear-sRGB→WCAG-luminance
script; see the numbers below.

| Token | Value | Hex (sRGB) | Role |
|---|---|---|---|
| `--bg` | `oklch(0.09 0 0)` | `#020202` | Page background. Pure neutral, no hue tint. |
| `--surface` | `oklch(0.15 0 0)` | `#0b0b0b` | Row hover, panels, quality picker. |
| `--surface-hover` | `oklch(0.19 0 0)` | — | Reserved for a second hover layer if needed. |
| `--border` | `oklch(0.24 0 0)` | `#1f1f1f` | Dividers, panel borders. |
| `--border-strong` | `oklch(0.32 0 0)` | — | Hover border on ghost buttons. |
| `--ink` | `oklch(0.94 0 0)` | `#ebebeb` | Primary text. |
| `--muted` | `oklch(0.62 0 0)` | `#868686`/`#9e9e9e` | Secondary text, metadata. |
| `--faint` | `oklch(0.42 0 0)` | — | Separators, disabled text. |
| `--primary` | `oklch(0.62 0.14 195)` | `#009fa0` | Primary action (download buttons, progress fill, focus ring, file-kind pill). Cyan-teal — deliberately *not* the purple/indigo of the old design, which was flagged as the generic-extension anti-reference. |
| `--primary-hover` | `oklch(0.67 0.14 195)` | — | |
| `--accent` | `oklch(0.82 0.15 70)` | `#ffb147` | Second brand color: HLS-kind pill, quality picker chips read against it conceptually. Warm amber, ~125° from primary — both hue- and lightness-distinct (verified `primary vs accent = 1.81:1`, clears the ≥1.7 distinctness floor). |
| `--danger` | `oklch(0.60 0.19 25)` | `#db4241` | Failed downloads ("retry" button). |
| `--danger-hover` | `oklch(0.65 0.19 25)` | — | |
| `--on-fill` | `oklch(0.12 0 0)` | near-black | Text/icon color for anything sitting on `--primary`/`--accent`/`--danger`. Computed, not assumed: black text beats white text on all three fills here because their WCAG relative luminance is higher than their OKLCH `L` suggests (cyan and amber both have high-luminance-weighted channels). |

Verified contrast ratios:
- `ink` vs `bg`: **17.36:1** (body text, floor is 7:1)
- `muted` vs `bg`: **5.68:1** / vs `surface`: **5.40:1** (floor 3.5:1)
- `on-fill` vs `primary`: **6.23:1**, vs `accent`: **11.25:1**, vs `danger`: **4.68:1** (floor 4.5:1 for normal text)
- `primary` vs `accent`: **1.81:1** (floor 1.7:1 — the two brand colors must read as distinct, not near-duplicates)

Color strategy: **Restrained-leaning-Committed**. Two brand hues (primary
teal, accent amber) plus one semantic danger red — deliberately not more.
Accent and danger never compete for the same role: accent marks *format*
(HLS), danger marks *state* (failure).

## Typography

One UI family (system sans stack) for structure and labels, one monospace
family for anything that is literally technical data — filenames, kind
pills, bitrates/resolutions in the quality picker, progress percentages.
This is the "terminal-honest, not costume-terminal" principle from
PRODUCT.md: monospace appears because real data is being shown, never as
decoration.

```
--font-ui:   -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
--font-mono: ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace;
```

Fixed rem/px scale (no fluid clamp — this is a fixed-size popup, not a
responsive page): 10px (footer) / 11px (metadata, mono) / 12px (buttons,
quality chips) / 13px (item names, base body).

## Components

Every interactive element defines default / hover / focus-visible / active
/ disabled, per the product register's "every component has these states"
rule:

- **`.action` button** — primary teal fill, `--on-fill` text. Variants:
  `.is-danger` (red fill, failed state), `.is-ghost` (transparent, border
  only — unsupported/disabled-by-design state like DASH). Each variant's
  hover rule repeats the variant class (`.action.is-danger:hover`) rather
  than relying on source-order — a plain `.action:hover` has lower
  specificity than a two-class hover selector, so without the repeated
  class every button would flash primary-teal on hover regardless of its
  actual state. This was caught live in the preview harness, not assumed.
- **`.kind-pill`** — small format badge (`file` teal / `stream` amber /
  `dash` muted), monospace, uppercase.
- **`.item-info`** — the whole name+meta block is one `role="button"
  tabindex="0"` target (not just a bare `<div onclick>`), Enter/Space
  toggles the preview. Focus ring inherits the global `:focus-visible`
  rule.
- **`.preview`** — inline `<video>`/`<audio>` panel, real playback (native
  for direct files, hls.js for streams).
- **`.quality-picker`** — chip list for multi-variant HLS manifests,
  populated from real parsed playlist data.
- **`.progress`** — 3px bar, teal fill; unused for terminal states (button
  text communicates saved/failed instead of a colored bar state).

## Motion

`--duration: 180ms` on hover/active transitions, `ease-out-expo`. The
wordmark's terminal-cursor blink is the one decorative touch — it's
`@keyframes blink` at 1.1s, and fully disabled (static, opaque) under
`prefers-reduced-motion: reduce`, along with every other transition on the
page (`--duration` drops to `0ms`).

## Icon

Toolbar icon: same rounded-square-with-download-arrow glyph as before,
recolored from the old purple (`#6d5efc`) to `--primary` teal (`#009fa0`)
to match. White glyph on the filled square — icons get the WCAG
non-text-contrast floor (3:1), not the 4.5:1 text floor, and white clears
that against this teal comfortably.

## Dev harness

[test/popup-preview.html](test/popup-preview.html) mocks the `chrome.*`
APIs popup.js needs (tabs.query, runtime.sendMessage, storage.session)
with fake detected items covering every state — file, HLS (real network
fetch through the actual parser/hls.js), AES-128 HLS, DASH, and a
deliberately-failing download — so the popup UI can be iterated on and
screenshotted without loading the real unpacked extension. Serve it with
`python3 -m http.server` from the repo root and open `/test/popup-preview.html`.
