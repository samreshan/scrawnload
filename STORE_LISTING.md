# Chrome Web Store listing — copy-paste reference

Everything below goes into the Developer Dashboard by hand; nothing here is
read by Chrome itself. Draft once, paste into the relevant dashboard fields.

## Store listing tab

**Title:** Scrawnload

**Summary** (≤132 chars, 110 used):
> Preview and download video, audio, and HLS streams from any page — decrypted and merged right in your browser.

**Category:** Tools (or the closest equivalent in the current dashboard dropdown — this list changes over time, pick nearest match)

**Detailed description:**
> Scrawnload finds playable video and audio on the page you're currently
> viewing, lets you preview it right in the popup, and saves a local copy —
> including HLS streams, which are decrypted and merged into a single file
> entirely inside your browser.
>
> WHAT IT DOES
> • Detects direct media files (MP4, WebM, MP3, and other common formats)
>   as well as HLS (.m3u8) streams, from both the page's markup and its
>   network requests
> • Click any detected item to preview it in place before downloading
>   anything
> • For HLS streams with multiple quality variants, choose a resolution
>   first
> • AES-128-encrypted HLS segments are decrypted and remuxed into a single
>   playable .mp4 — using ffmpeg compiled to WebAssembly, running entirely
>   in your browser. No server, no upload, no external processing.
>
> WHAT IT DOESN'T DO
> • No account, no login, no telemetry, no analytics — nothing is ever
>   sent off your device
> • Doesn't touch YouTube or DRM-protected content (Widevine/FairPlay) —
>   both are out of scope by design, not a bug
> • Doesn't work on live streams (no end marker) or bypass any site's
>   access controls
>
> WHO IT'S FOR
> Save content you actually have the rights to: your own uploads,
> self-hosted media, Creative-Commons or otherwise openly licensed
> streams, and educational material. Downloading from a given site may
> still be subject to that site's own terms — Scrawnload doesn't make
> that determination for you, so check first.
>
> Source available on GitHub; privacy policy and terms linked below.

(Note: this prose is duplicated in `how-it-works.html` — keep the two in sync if edited.)

**Privacy policy URL:** `https://samreshan.github.io/scrawnload/privacy.html`

**Website field (separate from Privacy policy URL):** `https://samreshan.github.io/scrawnload/how-it-works.html`

## Privacy practices tab

**Single purpose:**
> Detects downloadable video and audio on the currently active web page
> and lets the user preview and save it locally.

**Permission justifications** (one field per permission in the dashboard):

| Permission | Justification to paste |
|---|---|
| Host permissions (`<all_urls>`) | Needed to detect media on whatever page the user is currently viewing — the extension only acts on the active tab, not in the background across other sites. |
| `downloads` | Used to save the file the user explicitly chose to their device via Chrome's downloads API. |
| `storage` | Holds the list of detected media for the current tab in `chrome.storage.session` (in-memory, cleared on browser close) so the popup can display it, plus a single boolean flag in `chrome.storage.local` recording that the user has seen the one-time "only download media you have the rights to" notice. |
| `webRequest` | Read-only: observes response URLs and Content-Type headers to detect media that isn't visible in the page's HTML. Never blocks or modifies requests. |
| `webNavigation` | Clears the detected-media list when the tab navigates to a new page. |
| `tabs` | Identifies which tab's detected media to show when the popup opens. |
| `offscreen` | Hosts the ffmpeg.wasm engine that merges HLS segments into one file — this requires a document context the background service worker doesn't have. |

**Data usage disclosure:** Be literal and accurate here rather than
optimizing how it looks — the categories in the dashboard form ask what the
extension *accesses*, not just what it *transmits*:

- **Website content** — yes, accessed (video/audio URLs and page markup,
  read locally to power detection). Note in the free-text justification
  that it's processed transiently in-browser and never transmitted,
  stored beyond the current session, or shared.
- Every other category (personally identifiable info, health, financial,
  authentication, personal communications, location, web history, user
  activity) — not collected, leave unchecked.
- Certify: does not sell user data to third parties; does not use data
  for purposes unrelated to the single purpose above; does not use data
  to determine creditworthiness or for lending. All true here, since
  nothing leaves the device.
- Remote code: certify **no remotely hosted code** — true, everything
  (including ffmpeg.wasm and hls.js) is bundled in the package, nothing
  is fetched from a CDN at runtime.

## Screenshot

`store-assets/screenshot-1.png` (generated from the popup preview harness,
1280×800) — see below for how to regenerate if the UI changes.
