# Scrawnload

A Chrome extension (Manifest V3) that detects video/audio on the current page,
previews it in the popup, and downloads it — including HLS streams, which are
merged into a single `.mp4` entirely in the browser with ffmpeg.wasm.

## Capabilities

- **Direct media files** (`.mp4`, `.webm`, `.mkv`, `.mov`, `.m4v`, `.mp3`,
  `.m4a`, `.ogg`, `.wav`, `.flac`, `.aac`): detect, preview, download.
- **HLS streams** (`.m3u8`): detect, preview (via hls.js), and download with a
  quality picker for multi-variant playlists. Segments are fetched in
  parallel, AES-128-encrypted segments are decrypted with WebCrypto, and
  everything is remuxed to a single `.mp4` by ffmpeg.wasm in an offscreen
  document. Both MPEG-TS and fMP4 segment formats are supported.
- **DASH** (`.mpd`): detected and listed, download not implemented.

### Known limits

- **YouTube, Instagram, TikTok etc.** still won't work: they use `blob:` MSE
  players with segmented, often DRM-protected delivery, and YouTube actively
  breaks downloaders.
- **DRM** (Widevine/FairPlay/SAMPLE-AES): out of scope; these show as
  unsupported.
- **Live streams** (no `EXT-X-ENDLIST`): rejected with an error.
- **Memory**: segments are held in RAM before merging; very long/high-bitrate
  videos (roughly >1–2 GB) may run out of memory.
- **Referer/cookie-gated CDNs**: segment fetches come from the extension, not
  the page, so hosts requiring a page Referer may return 403.

## Architecture

```
content-script.js   DOM scanning: <video>/<audio>/<source>, og:video, media links
background.js       service worker: network observation (webRequest, non-blocking),
                    per-tab detection store (storage.session), download + job
                    orchestration, offscreen lifecycle
offscreen.html/js   ffmpeg.wasm host: playlist fetch → segment fetch (4-way
                    concurrent) → AES-128 decrypt (WebCrypto) → concat →
                    remux (-c copy) → blob URL back to the service worker
popup.html/js/css   detection list, click-to-expand previews (hls.js for
                    streams), quality picker, progress bars rehydrated from
                    storage.session job state
lib/m3u8.js         minimal HLS playlist parser shared by popup + offscreen
vendor/             pinned UMD builds: @ffmpeg/ffmpeg + core (single-thread,
                    no SharedArrayBuffer needed), @ffmpeg/util, hls.js
```

Job state lives in `chrome.storage.session` (survives MV3 service-worker
restarts); offscreen job results arrive as fresh messages so a worker restart
mid-job can't lose them; blob URLs are revoked only after `chrome.downloads`
reports the save finished.

## Load it locally

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.
4. Open `test/sample.html` in a tab — the badge should count 4 items
   (2 direct files + 2 HLS streams).

## Vendored libraries

`vendor/` is committed so the extension loads unpacked with no build step.
To upgrade versions, edit the pins in `scripts/fetch-vendor.sh` and re-run it.

## Design

See [PRODUCT.md](PRODUCT.md) (who it's for, brand personality, anti-references)
and [DESIGN.md](DESIGN.md) (color tokens with verified contrast ratios,
typography, component states). The popup commits to a dark, terminal-native
look — no light theme, by design. [test/popup-preview.html](test/popup-preview.html)
is a standalone harness (mocked `chrome.*` APIs) for iterating on the popup UI
in a plain browser tab without loading the real extension.

## Notes

- Downloading media from a site may violate that site's terms of service —
  this tool doesn't make that determination for you.
- Circumventing DRM is illegal in most jurisdictions; this extension doesn't
  and won't.
