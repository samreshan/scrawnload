# Scrawnload

A Chrome extension (Manifest V3) that detects video/audio files on the current
page and downloads them with one click.

This is the MVP tier: it handles direct media files (`.mp4`, `.webm`, `.mkv`,
`.mov`, `.m4v`, `.mp3`, `.m4a`, `.ogg`, `.wav`, `.flac`, `.aac`). It also
detects HLS/DASH manifests (`.m3u8`, `.mpd`) so you can see that a page has
streaming media, but download is disabled for those — merging segments into a
single file needs either an in-browser ffmpeg.wasm pipeline or a native
companion app, neither of which is built yet.

## How it works

- `content-script.js` scans the DOM (`<video>`/`<audio>`/`<source>` tags,
  `og:video` meta tags, direct media links) and re-scans on mutation and on a
  timer for SPA navigations.
- `background.js` is the service worker. It also watches network responses
  via `chrome.webRequest.onResponseStarted` (non-blocking, read-only) to catch
  media that isn't in the DOM, classifying by file extension or
  `Content-Type` header. It keeps a per-tab list of detected items and clears
  it on real navigations.
- `popup.html`/`popup.js` list whatever's been detected for the active tab
  and trigger `chrome.downloads.download()` for downloadable items.

## What works and what doesn't

**Works:** sites that serve video/audio as direct files — a `<video>` tag or
network response pointing at an actual `.mp4`/`.webm`/etc. URL. Open
`test/sample.html` in the browser to verify the extension end to end.

**Doesn't work (yet):** YouTube, Instagram, TikTok, and most large streaming
platforms. Their players use Media Source Extensions — the `<video>` tag's
`src` is a `blob:` URL that cannot be downloaded, and the media arrives as
hundreds of separate segments (HLS/DASH), often DRM-protected. Supporting
those requires the segment-merging tier from the roadmap; YouTube in
particular actively breaks downloaders and is excluded even by mature
extensions like Video DownloadHelper.

## Load it locally

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.
4. Visit a page with video, click the toolbar icon.

## Roadmap

- Site-specific parsers for pages that obfuscate media URLs.
- Quality/format picker for multi-bitrate sources.
- HLS/DASH downloading via ffmpeg.wasm (in-browser) or a native messaging
  companion app (real ffmpeg, faster, requires a separate installer).

## Notes

- Downloading media from a site may violate that site's terms of service —
  this tool doesn't make that determination for you.
- DRM-protected content (Widevine/FairPlay) is out of scope; circumventing it
  is illegal in most jurisdictions regardless of technical feasibility.
