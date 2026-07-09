const MEDIA_EXT_REGEX = /\.(mp4|webm|mkv|mov|m4v|m4a|mp3|ogg|oga|wav|flac|aac)(\?|#|$)/i;
const STREAM_EXT_REGEX = /\.(m3u8|mpd)(\?|#|$)/i;

// Detections live in chrome.storage.session, not module state: MV3 kills the
// service worker after ~30s idle, which would wipe an in-memory map.
function tabKey(tabId) {
  return `tab-${tabId}`;
}

async function getTabItems(tabId) {
  const key = tabKey(tabId);
  const data = await chrome.storage.session.get(key);
  return data[key] || {};
}

function classifyUrl(url) {
  if (STREAM_EXT_REGEX.test(url)) return "stream";
  if (MEDIA_EXT_REGEX.test(url)) return "file";
  return null;
}

function classifyContentType(contentType) {
  if (!contentType) return null;
  const type = contentType.toLowerCase();
  if (type.includes("mpegurl") || type.includes("dash+xml")) return "stream";
  if (type.startsWith("video/") || type.startsWith("audio/")) return "file";
  return null;
}

function updateBadge(tabId, count) {
  chrome.action.setBadgeText({ tabId, text: count ? String(count) : "" });
  chrome.action.setBadgeBackgroundColor({ tabId, color: "#6d5efc" });
}

async function addDetection(tabId, item) {
  if (tabId === undefined || tabId < 0) return;
  // blob: and data: URLs come from MSE players and can't be downloaded.
  if (/^(blob|data):/.test(item.url)) return;
  const items = await getTabItems(tabId);
  if (items[item.url]) return;
  items[item.url] = item;
  await chrome.storage.session.set({ [tabKey(tabId)]: items });
  updateBadge(tabId, Object.keys(items).length);
}

async function clearTab(tabId) {
  await chrome.storage.session.remove(tabKey(tabId));
  updateBadge(tabId, 0);
}

// Network-level detection: observe responses without blocking them.
chrome.webRequest.onResponseStarted.addListener(
  (details) => {
    if (details.tabId === undefined || details.tabId < 0) return;

    let kind = classifyUrl(details.url);
    if (!kind) {
      const header = (details.responseHeaders || []).find(
        (h) => h.name.toLowerCase() === "content-type"
      );
      kind = classifyContentType(header && header.value);
    }
    if (!kind) return;

    addDetection(details.tabId, {
      url: details.url,
      kind,
      source: "network",
      title: null,
      detectedAt: Date.now(),
    });
  },
  { urls: ["<all_urls>"], types: ["media", "object", "xmlhttprequest", "other"] },
  ["responseHeaders"]
);

// --- HLS download jobs (delegated to the offscreen ffmpeg.wasm host) ---

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });
  if (contexts.length > 0) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["WORKERS", "BLOBS"],
    justification:
      "Runs ffmpeg.wasm to merge HLS stream segments into a single video file",
  });
}

function jobKey(jobId) {
  return `job-${jobId}`;
}

async function setJobState(jobId, state) {
  const key = jobKey(jobId);
  const data = await chrome.storage.session.get(key);
  await chrome.storage.session.set({ [key]: { ...(data[key] || {}), ...state } });
}

async function startStreamJob({ jobId, playlistUrl, originUrl, filename }) {
  await setJobState(jobId, {
    jobId,
    playlistUrl,
    originUrl,
    filename,
    status: "running",
    phase: "starting",
    done: 0,
    total: 0,
    startedAt: Date.now(),
  });
  await ensureOffscreen();
  await chrome.runtime.sendMessage({ type: "RUN_HLS_JOB", jobId, playlistUrl, filename });
}

async function finishJob(jobId, blobUrl, filename) {
  chrome.downloads.download({ url: blobUrl, filename, saveAs: false }, (downloadId) => {
    if (chrome.runtime.lastError || downloadId === undefined) {
      setJobState(jobId, {
        status: "error",
        error: chrome.runtime.lastError ? chrome.runtime.lastError.message : "download failed",
      });
      releaseBlob(jobId);
      return;
    }
    chrome.storage.session.set({ [`dl-${downloadId}`]: jobId });
  });
}

async function releaseBlob(jobId) {
  try {
    const res = await chrome.runtime.sendMessage({ type: "RELEASE_BLOB", jobId });
    if (res && !res.busy) {
      await chrome.offscreen.closeDocument().catch(() => {});
    }
  } catch {
    // Offscreen already gone.
  }
}

chrome.downloads.onChanged.addListener(async (delta) => {
  if (!delta.state) return;
  const key = `dl-${delta.id}`;
  const data = await chrome.storage.session.get(key);
  const jobId = data[key];
  if (!jobId) return;

  if (delta.state.current === "complete") {
    await setJobState(jobId, { status: "complete" });
  } else if (delta.state.current === "interrupted") {
    await setJobState(jobId, { status: "error", error: "download interrupted" });
  } else {
    return;
  }
  await chrome.storage.session.remove(key);
  releaseBlob(jobId);
});

// DOM-level detection relayed from the content script, plus popup requests.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "MEDIA_DETECTED" && sender.tab) {
    const kind = classifyUrl(message.url) || "file";
    addDetection(sender.tab.id, {
      url: message.url,
      kind,
      source: "dom",
      title: message.title || null,
      detectedAt: Date.now(),
    });
    return;
  }

  if (message.type === "GET_DETECTED") {
    getTabItems(message.tabId).then((items) => {
      sendResponse({ items: Object.values(items) });
    });
    return true;
  }

  if (message.type === "DOWNLOAD") {
    chrome.downloads.download(
      { url: message.url, filename: message.filename, saveAs: false },
      () => {
        sendResponse({
          ok: !chrome.runtime.lastError,
          error: chrome.runtime.lastError && chrome.runtime.lastError.message,
        });
      }
    );
    return true;
  }

  if (message.type === "DOWNLOAD_STREAM") {
    startStreamJob(message)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === "JOB_PROGRESS") {
    setJobState(message.jobId, {
      phase: message.phase,
      done: message.done,
      total: message.total,
    });
    // Also reaches the popup directly since runtime messages broadcast to
    // all extension contexts; nothing to relay.
    return;
  }

  if (message.type === "JOB_COMPLETE") {
    finishJob(message.jobId, message.blobUrl, message.filename);
    return;
  }

  if (message.type === "JOB_ERROR") {
    setJobState(message.jobId, { status: "error", error: message.error });
    releaseBlob(message.jobId);
    return;
  }

  if (message.type === "GET_JOBS") {
    chrome.storage.session.get(null).then((all) => {
      const jobs = Object.entries(all)
        .filter(([k]) => k.startsWith("job-"))
        .map(([, v]) => v);
      sendResponse({ jobs });
    });
    return true;
  }
});

// Clear detections when a tab does a real (non-SPA) navigation.
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId === 0) {
    clearTab(details.tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(tabKey(tabId));
});
