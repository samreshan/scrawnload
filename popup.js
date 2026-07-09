const STREAM_KIND = "stream";

function extFromUrl(url) {
  try {
    const path = new URL(url).pathname;
    const match = path.match(/\.([a-z0-9]+)$/i);
    return match ? match[1].toLowerCase() : "";
  } catch {
    return "";
  }
}

function filenameFromUrl(url, title) {
  try {
    const path = new URL(url).pathname;
    const base = path.split("/").filter(Boolean).pop();
    if (base) return decodeURIComponent(base);
  } catch {
    // fall through to the title-based name below
  }
  const ext = extFromUrl(url) || "mp4";
  const safeTitle = (title || "video").replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
  return `${safeTitle}.${ext}`;
}

function renderItem(item) {
  const row = document.createElement("div");
  row.className = "item";

  const info = document.createElement("div");
  info.className = "item-info";

  const name = document.createElement("div");
  name.className = "item-name";
  name.textContent = filenameFromUrl(item.url, item.title);
  info.appendChild(name);

  const meta = document.createElement("div");
  meta.className = "item-meta";
  const ext = extFromUrl(item.url) || (item.kind === STREAM_KIND ? "stream" : "file");
  meta.textContent = `${ext.toUpperCase()} · ${item.source}`;
  info.appendChild(meta);

  row.appendChild(info);

  const btn = document.createElement("button");
  if (item.kind === STREAM_KIND) {
    btn.textContent = "Unsupported";
    btn.disabled = true;
    btn.title = "Streaming manifests (HLS/DASH) need segment merging, not implemented yet.";
  } else {
    btn.textContent = "Download";
    btn.addEventListener("click", () => {
      btn.disabled = true;
      btn.textContent = "Saving…";
      chrome.runtime.sendMessage(
        { type: "DOWNLOAD", url: item.url, filename: filenameFromUrl(item.url, item.title) },
        (response) => {
          if (response && response.ok) {
            btn.textContent = "Saved";
          } else {
            btn.textContent = "Failed";
            btn.disabled = false;
          }
        }
      );
    });
  }
  row.appendChild(btn);
  return row;
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const listEl = document.getElementById("list");
  const countEl = document.getElementById("count");

  if (!tab) {
    listEl.innerHTML = '<p class="empty">No active tab.</p>';
    return;
  }

  chrome.runtime.sendMessage({ type: "GET_DETECTED", tabId: tab.id }, (response) => {
    const items = (response && response.items) || [];
    listEl.innerHTML = "";
    if (items.length === 0) {
      listEl.innerHTML = '<p class="empty">No media detected on this page yet.</p>';
    } else {
      items
        .slice()
        .sort((a, b) => a.kind.localeCompare(b.kind))
        .forEach((item) => listEl.appendChild(renderItem(item)));
    }
    countEl.textContent = `${items.length} item${items.length === 1 ? "" : "s"}`;
  });
}

init();
