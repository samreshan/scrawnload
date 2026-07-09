const MEDIA_EXT_REGEX = /\.(mp4|webm|mkv|mov|m4v|m4a|mp3|ogg|oga|wav|flac|aac)(\?|#|$)/i;
const STREAM_EXT_REGEX = /\.(m3u8|mpd)(\?|#|$)/i;

const detectedByTab = new Map();

function getTabMap(tabId) {
  if (!detectedByTab.has(tabId)) detectedByTab.set(tabId, new Map());
  return detectedByTab.get(tabId);
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

function updateBadge(tabId) {
  const tabMap = detectedByTab.get(tabId);
  const count = tabMap ? tabMap.size : 0;
  chrome.action.setBadgeText({ tabId, text: count ? String(count) : "" });
  chrome.action.setBadgeBackgroundColor({ tabId, color: "#6d5efc" });
}

function addDetection(tabId, item) {
  if (tabId === undefined || tabId < 0) return;
  const tabMap = getTabMap(tabId);
  if (tabMap.has(item.url)) return;
  tabMap.set(item.url, item);
  updateBadge(tabId);
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
    const tabMap = detectedByTab.get(message.tabId);
    sendResponse({ items: tabMap ? Array.from(tabMap.values()) : [] });
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
    detectedByTab.delete(details.tabId);
    updateBadge(details.tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  detectedByTab.delete(tabId);
});
