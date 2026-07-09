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
