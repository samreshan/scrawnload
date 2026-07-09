# Product

## Register

product

## Users

Anyone browsing a page with video or audio who wants a local copy — not a specialist audience, but the interaction itself is technical: a small popup window, a few seconds of attention, glance-and-click. The user opens the toolbar icon, needs to immediately understand what's on the page, and either previews or downloads in one or two clicks. Sessions are short; nothing should slow down that path.

## Product Purpose

Scrawnload detects downloadable media (direct files and HLS streams) on the current tab, lets the user preview it before committing, and downloads or merges it locally — including in-browser HLS-to-MP4 merging via ffmpeg.wasm. Success is: the popup opens, the user instantly reads what's available and its state (file vs. stream, encrypted vs. not, quality options), and a download completes with visible progress and no confusion about what happened.

## Brand Personality

Precise & technical. Dev-tool energy — built by engineers, for anyone, but it doesn't hide that. Confident, no-fluff, information-dense without being cluttered. Monospace accents where real technical data (URLs, codecs, resolutions, bitrates) is shown. Feels engineered, not decorated.

## Anti-references

- The generic browser-extension-store look: bland gradient icon, cramped unstyled list rows, default form-control buttons, no visual identity — the aesthetic of most unmaintained extensions.
- Corporate/enterprise SaaS dashboard cliches: card grids, navy-and-white palettes, trust-badge styling. This is a pocket tool, not an admin panel.

## Design Principles

1. **Legible at popup scale.** Every decision is validated at the real 400px-wide popup, not a full-page mockup — if it doesn't hold up that small, it doesn't ship.
2. **Status over decoration.** Progress, encryption state, format, and quality are functional signals. Color and motion exist to clarify state, not to perform.
3. **One accent, used sparingly.** A single saturated color carries all "this is actionable" meaning; nothing else competes for attention.
4. **Terminal-honest, not costume-terminal.** Monospace and technical framing come from showing real data (actual URLs, codecs, bitrates), never decorative ASCII/fake CLI chrome for its own sake.
5. **Respect the user's few seconds.** No onboarding tour, no marketing copy, no clever empty states that delay getting to the list.

## Accessibility & Inclusion

WCAG AA contrast minimum (body text ≥4.5:1, large text ≥3:1). All interactive elements keyboard-reachable with a visible focus state. `prefers-reduced-motion` respected for every transition. Color is never the sole signal for state — pair with icon or text.
