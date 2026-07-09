# Design

Visual system for Scrawnload's popup. See [PRODUCT.md](PRODUCT.md) for the
strategic brief this serves (register: product, personality: precise &
technical, terminal-native dark mode).

## Theme

Light is a **committed identity**, not a `prefers-color-scheme` fallback —
`:root { color-scheme: light; }` and there is no dark variant. This
supersedes the project's original dark terminal-native theme: the personality
(precise & technical) and name are unchanged, but a design review judged the
dark+teal/amber pairing wasn't landing. Same non-adaptive-single-theme
philosophy as before, just flipped.

## Color

All tokens in OKLCH, defined in [popup.css](popup.css). Contrast was
computed (not eyeballed) via a standalone OKLab→linear-sRGB→WCAG-luminance
script, and the two color-mix-based pill fills were additionally verified
against real rendered pixels (sampled from actual screenshots) since
`color-mix()`'s composited output isn't reliably hand-computable.

| Token | Value | Hex (sRGB) | Role |
|---|---|---|---|
| `--bg` | `oklch(1 0 0)` | `#ffffff` | Page background. Pure white. |
| `--surface` | `oklch(0.97 0 0)` | `#f5f5f5` | Row hover, panels, quality picker. |
| `--surface-hover` | `oklch(0.94 0 0)` | — | Reserved second hover layer. |
| `--border` | `oklch(0.88 0 0)` | `#d7d7d7` | Dividers, panel borders. |
| `--border-strong` | `oklch(0.76 0 0)` | `#b1b1b1` | Hover border on ghost buttons. |
| `--ink` | `oklch(0.20 0 0)` | `#161616` | Primary text. |
| `--muted` | `oklch(0.46 0 0)` | `#585858` | Secondary text, metadata. |
| `--faint` | `oklch(0.65 0 0)` | — | Separators, disabled text. |
| `--primary` | `oklch(0.39 0.12 195)` | `#005759` | Primary action (download buttons, progress fill, focus ring, file-kind pill). Same teal hue as the original identity, recalibrated darker for a white background. |
| `--primary-hover` | `oklch(0.33 0.12 195)` | `#004648` | |
| `--accent` | `oklch(0.60 0.16 58)` | `#c46200` | Second brand color: HLS-kind pill tint generator. Kept bright so it still reads as amber and stays hue+lightness distinct from primary. |
| `--accent-ink` | `oklch(0.40 0.16 55)` | `#832000` | Separate, darker text-on-tint color for the accent pill. `--accent` itself measured only 3.11:1 as its own pill's text (checked empirically), because a tint bright enough to read as "amber" isn't automatically dark enough to be legible on the pale background it generates — this token exists specifically to decouple those two needs. |
| `--danger` | `oklch(0.50 0.20 25)` | `#bb061e` | Failed downloads ("retry" button). |
| `--danger-hover` | `oklch(0.44 0.20 25)` | `#a50007` | |
| `--on-fill` | `oklch(1 0 0)` | white | Text/icon color for `--primary`/`--danger` fills. Flipped from the old dark theme's near-black `--on-fill`: white now wins on both (verified 8.42:1 / 6.67:1) because a fill dark enough to stand out on white pushes its luminance low enough that white text reads best — the opposite of what held on a dark background. |

Verified contrast ratios:
- `ink` vs `bg`: **18.10:1** (body text, floor is 7:1)
- `muted` vs `bg`: **7.13:1** (floor 3.5:1)
- `on-fill` (white) vs `primary`: **8.42:1**, vs `danger`: **6.67:1** (floor 4.5:1)
- `primary` vs `accent`: **2.03:1** (floor 1.7:1 — the two brand colors must read as distinct, not near-duplicates)
- kind-pill text vs its own composited tint background (real rendered pixels, not theoretical): file/primary **5.77:1**, stream/accent **7.29:1** (after the `--accent-ink` fix; the naive `color: var(--accent)` version measured **3.11:1** and failed), dash/muted **5.09:1**

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
recolored to the new `--primary` teal (`#005759`) to match. White glyph on
the filled square — icons get the WCAG non-text-contrast floor (3:1), not
the 4.5:1 text floor, and white clears that against this teal comfortably.

## Dev harness

[test/popup-preview.html](test/popup-preview.html) mocks the `chrome.*`
APIs popup.js needs (tabs.query, runtime.sendMessage, storage.session)
with fake detected items covering every state — file, HLS (real network
fetch through the actual parser/hls.js), AES-128 HLS, DASH, and a
deliberately-failing download — so the popup UI can be iterated on and
screenshotted without loading the real unpacked extension. Serve it with
`python3 -m http.server` from the repo root and open `/test/popup-preview.html`.
