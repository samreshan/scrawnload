// Offscreen document: hosts ffmpeg.wasm and performs HLS download jobs.
// The service worker can't run wasm or create blob URLs, so it delegates here.
//
// Job results are sent as fresh JOB_COMPLETE / JOB_ERROR messages rather than
// sendResponse callbacks: the service worker may be killed during a long job,
// and a new message re-wakes it, while a pending sendResponse would be lost.
const { FFmpeg } = FFmpegWASM;

const FETCH_CONCURRENCY = 4;
const FETCH_MAX_ATTEMPTS = 4;
const FETCH_TIMEOUT_MS = 20000;

let ffmpeg = null;
let ffmpegLoading = null;
let currentJobId = null;
// Serialize jobs: they share one ffmpeg instance and its virtual FS.
let jobQueue = Promise.resolve();
let activeJobs = 0;
// Blob URLs handed to the service worker, kept until it confirms the
// download finished so revocation doesn't race the download.
const pendingBlobUrls = new Map();

async function getFFmpeg() {
  if (ffmpeg && ffmpeg.loaded) return ffmpeg;
  if (!ffmpegLoading) {
    ffmpeg = new FFmpeg();
    ffmpeg.on("progress", ({ progress }) => {
      if (currentJobId) {
        reportProgress(currentJobId, "merging", Math.round(progress * 100), 100);
      }
    });
    ffmpegLoading = ffmpeg.load({
      coreURL: chrome.runtime.getURL("vendor/ffmpeg/ffmpeg-core.js"),
      wasmURL: chrome.runtime.getURL("vendor/ffmpeg/ffmpeg-core.wasm"),
      classWorkerURL: chrome.runtime.getURL("vendor/ffmpeg/814.ffmpeg.js"),
    });
  }
  await ffmpegLoading;
  return ffmpeg;
}

function reportProgress(jobId, phase, done, total) {
  chrome.runtime.sendMessage({ type: "JOB_PROGRESS", jobId, phase, done, total })
    .catch(() => {});
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status) {
  return status === 429 || status >= 500;
}

// Marks whether a failed attempt is worth retrying: network-level failures
// (DNS, CORS, connection reset, our own timeout) always are; HTTP errors
// only for 429/5xx — retrying a 403/404 just delays the inevitable.
class FetchAttemptError extends Error {
  constructor(message, retryable) {
    super(message);
    this.retryable = retryable;
  }
}

async function fetchOnce(url, signal) {
  let res;
  try {
    res = await fetch(url, { credentials: "include", signal });
  } catch (err) {
    throw new FetchAttemptError(err.message, true);
  }
  if (res.ok) return new Uint8Array(await res.arrayBuffer());
  throw new FetchAttemptError(`HTTP ${res.status} fetching ${url}`, isRetryableStatus(res.status));
}

// A long HLS download means hundreds of segment requests; without retry,
// any single transient blip (or a CDN briefly rate-limiting after many
// rapid requests) aborts the whole job with a raw "Failed to fetch".
async function fetchBytes(url) {
  let lastErr;
  for (let attempt = 1; attempt <= FETCH_MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      return await fetchOnce(url, controller.signal);
    } catch (err) {
      lastErr = err;
      if (!err.retryable || attempt === FETCH_MAX_ATTEMPTS) {
        throw new Error(attempt > 1 ? `${err.message} (failed after ${attempt} attempts)` : err.message);
      }
      await sleep(300 * 2 ** (attempt - 1) + Math.random() * 200);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

// HLS AES-128: segments are AES-CBC encrypted. When the playlist gives no
// explicit IV, the IV is the segment's media sequence number as a 16-byte
// big-endian integer.
function ivForSegment(explicitIv, mediaSequence) {
  const iv = new Uint8Array(16);
  if (explicitIv) {
    const hex = explicitIv.replace(/^0x/i, "").padStart(32, "0");
    for (let i = 0; i < 16; i++) iv[i] = parseInt(hex.substr(i * 2, 2), 16);
  } else {
    let seq = mediaSequence;
    for (let i = 15; i >= 12; i--) {
      iv[i] = seq & 0xff;
      seq = Math.floor(seq / 256);
    }
  }
  return iv;
}

async function decryptSegment(data, keyBytes, iv) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-CBC" },
    false,
    ["decrypt"]
  );
  const plain = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, cryptoKey, data);
  return new Uint8Array(plain);
}

async function fetchSegments(parsed, jobId) {
  const keyCache = new Map();
  function getKey(uri) {
    if (!keyCache.has(uri)) keyCache.set(uri, fetchBytes(uri));
    return keyCache.get(uri);
  }

  const results = new Array(parsed.segments.length);
  let fetched = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < parsed.segments.length) {
      const index = cursor++;
      const seg = parsed.segments[index];
      let data = await fetchBytes(seg.url);
      if (seg.key && seg.key.method === "AES-128") {
        const keyBytes = await getKey(seg.key.uri);
        const iv = ivForSegment(seg.key.iv, parsed.mediaSequence + index);
        data = await decryptSegment(data, keyBytes, iv);
      }
      results[index] = data;
      fetched++;
      reportProgress(jobId, "fetching", fetched, parsed.segments.length);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(FETCH_CONCURRENCY, parsed.segments.length) }, worker)
  );
  return results;
}

function concatSegments(initSegmentData, segmentDataList) {
  const parts = initSegmentData ? [initSegmentData, ...segmentDataList] : segmentDataList;
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.length;
  }
  return merged;
}

async function runJob({ jobId, playlistUrl, filename }) {
  const playlistText = new TextDecoder().decode(await fetchBytes(playlistUrl));
  const parsed = ScrawnloadM3U8.parse(playlistText, playlistUrl);

  if (parsed.isMaster) {
    // The popup normally resolves variants; fall back to highest bandwidth.
    const best = parsed.variants.reduce((a, b) =>
      (b.bandwidth || 0) > (a.bandwidth || 0) ? b : a
    );
    return runJob({ jobId, playlistUrl: best.url, filename });
  }

  if (parsed.live) throw new Error("Live streams are not supported");
  if (parsed.segments.length === 0) throw new Error("Playlist has no segments");

  const encryption = ScrawnloadM3U8.encryptionKind(parsed);
  if (encryption === "drm") throw new Error("DRM-protected stream (SAMPLE-AES) — unsupported");

  let initData = null;
  if (parsed.initSegment) initData = await fetchBytes(parsed.initSegment);
  const segments = await fetchSegments(parsed, jobId);
  const merged = concatSegments(initData, segments);

  reportProgress(jobId, "merging", 0, 100);
  const ff = await getFFmpeg();
  currentJobId = jobId;
  // fMP4 segments (EXT-X-MAP present) are already MP4 fragments; TS otherwise.
  const inputName = parsed.initSegment ? "input.mp4" : "input.ts";
  try {
    await ff.writeFile(inputName, merged);
    const code = await ff.exec(["-i", inputName, "-c", "copy", "output.mp4"]);
    if (code !== 0) throw new Error(`ffmpeg remux failed (exit ${code})`);
    const output = await ff.readFile("output.mp4");
    reportProgress(jobId, "merging", 100, 100);

    const blob = new Blob([output], { type: "video/mp4" });
    const blobUrl = URL.createObjectURL(blob);
    pendingBlobUrls.set(jobId, blobUrl);
    return { blobUrl, filename };
  } finally {
    currentJobId = null;
    await ff.deleteFile(inputName).catch(() => {});
    await ff.deleteFile("output.mp4").catch(() => {});
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "RUN_HLS_JOB") {
    activeJobs++;
    jobQueue = jobQueue.then(() =>
      runJob(message)
        .then(({ blobUrl, filename }) => {
          chrome.runtime.sendMessage({
            type: "JOB_COMPLETE",
            jobId: message.jobId,
            blobUrl,
            filename,
          });
        })
        .catch((err) => {
          chrome.runtime.sendMessage({
            type: "JOB_ERROR",
            jobId: message.jobId,
            error: err.message,
          });
        })
        .finally(() => {
          activeJobs--;
        })
    );
    sendResponse({ accepted: true });
    return;
  }

  if (message.type === "RELEASE_BLOB") {
    const url = pendingBlobUrls.get(message.jobId);
    if (url) {
      URL.revokeObjectURL(url);
      pendingBlobUrls.delete(message.jobId);
    }
    // busy guards against the service worker closing this document while
    // another job is still queued or running.
    sendResponse({ ok: true, busy: activeJobs > 0 || pendingBlobUrls.size > 0 });
    return;
  }
});
