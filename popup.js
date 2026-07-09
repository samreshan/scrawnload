const AUDIO_EXTS = new Set(["mp3", "m4a", "ogg", "oga", "wav", "flac", "aac"]);

let activePreview = null; // { panel, media, hls } — only one preview at a time

function extFromUrl(url) {
  try {
    const path = new URL(url).pathname;
    const match = path.match(/\.([a-z0-9]+)$/i);
    return match ? match[1].toLowerCase() : "";
  } catch {
    return "";
  }
}

function filenameFromUrl(url, title, forcedExt) {
  if (!forcedExt) {
    try {
      const path = new URL(url).pathname;
      const base = path.split("/").filter(Boolean).pop();
      if (base) return decodeURIComponent(base);
    } catch {
      // fall through to the title-based name below
    }
  }
  const ext = forcedExt || extFromUrl(url) || "mp4";
  const safeTitle = (title || "video").replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
  return `${safeTitle}.${ext}`;
}

function closeActivePreview() {
  if (!activePreview) return;
  if (activePreview.hls) activePreview.hls.destroy();
  if (activePreview.media) {
    activePreview.media.pause();
    activePreview.media.removeAttribute("src");
    activePreview.media.load();
  }
  activePreview.panel.remove();
  activePreview = null;
}

function openPreview(item, row) {
  const panel = document.createElement("div");
  panel.className = "preview";

  const isAudio = item.kind !== "stream" && AUDIO_EXTS.has(extFromUrl(item.url));
  const media = document.createElement(isAudio ? "audio" : "video");
  media.controls = true;
  media.autoplay = true;
  media.muted = !isAudio;
  panel.appendChild(media);

  let hls = null;
  if (item.kind === "stream") {
    if (Hls.isSupported()) {
      hls = new Hls({ maxBufferLength: 15 });
      hls.loadSource(item.url);
      hls.attachMedia(media);
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) {
          panel.classList.add("preview-error");
          panel.textContent = `preview failed: ${data.details}`;
          hls.destroy();
        }
      });
    } else {
      panel.textContent = "hls.js unsupported in this browser";
    }
  } else {
    media.src = item.url;
    media.addEventListener("error", () => {
      panel.classList.add("preview-error");
      panel.textContent = "preview failed to load (site may block hotlinking)";
    });
  }

  row.after(panel);
  activePreview = { panel, media, hls };
}

function togglePreview(item, row) {
  const wasOpen = activePreview && activePreview.panel.previousElementSibling === row;
  closeActivePreview();
  if (!wasOpen) openPreview(item, row);
}

// --- stream download flow ---

async function pickVariant(item, row) {
  // Fetch the playlist; if it's a master, expand a quality picker under the
  // row and resolve with the chosen media playlist URL.
  const res = await fetch(item.url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const parsed = ScrawnloadM3U8.parse(await res.text(), item.url);

  if (!parsed.isMaster) {
    if (ScrawnloadM3U8.encryptionKind(parsed) === "drm") {
      throw new Error("DRM-protected — unsupported");
    }
    return item.url;
  }
  if (parsed.variants.length === 1) return parsed.variants[0].url;

  return new Promise((resolve, reject) => {
    const picker = document.createElement("div");
    picker.className = "quality-picker";
    const label = document.createElement("div");
    label.className = "quality-label";
    label.textContent = "pick quality";
    picker.appendChild(label);

    parsed.variants
      .slice()
      .sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0))
      .forEach((variant) => {
        const btn = document.createElement("button");
        btn.className = "quality-option";
        const mbps = variant.bandwidth
          ? `${(variant.bandwidth / 1e6).toFixed(1)}mbps`
          : "rate unknown";
        btn.textContent = variant.resolution ? `${variant.resolution} · ${mbps}` : mbps;
        btn.addEventListener("click", () => {
          picker.remove();
          resolve(variant.url);
        });
        picker.appendChild(btn);
      });

    const cancel = document.createElement("button");
    cancel.className = "quality-option quality-cancel";
    cancel.textContent = "cancel";
    cancel.addEventListener("click", () => {
      picker.remove();
      reject(new Error("cancelled"));
    });
    picker.appendChild(cancel);

    row.after(picker);
  });
}

function setProgress(row, jobState) {
  let bar = row.querySelector(".progress");
  let fill = row.querySelector(".progress-fill");
  const status = row.querySelector(".meta-status");

  if (jobState.status === "complete") {
    if (bar) bar.remove();
    const btn = row.querySelector("button");
    btn.textContent = "saved";
    if (status) status.textContent = "saved";
    return;
  }
  if (jobState.status === "error") {
    if (bar) bar.remove();
    const btn = row.querySelector("button");
    btn.textContent = "retry";
    btn.disabled = false;
    btn.title = jobState.error || "";
    if (status) status.textContent = `error: ${(jobState.error || "").slice(0, 50)}`;
    return;
  }

  if (!bar) {
    bar = document.createElement("div");
    bar.className = "progress";
    fill = document.createElement("div");
    fill.className = "progress-fill";
    bar.appendChild(fill);
    row.querySelector(".item-info").appendChild(bar);
  }
  const pct = jobState.total ? Math.round((jobState.done / jobState.total) * 100) : 0;
  fill.style.width = `${pct}%`;
  if (status) {
    status.textContent =
      jobState.phase === "merging"
        ? `merging ${pct}%`
        : `fetching ${jobState.done}/${jobState.total}`;
  }
}

const rowsByJobId = new Map();

async function startStreamDownload(item, row, btn) {
  btn.disabled = true;
  btn.textContent = "preparing…";
  let playlistUrl;
  try {
    playlistUrl = await pickVariant(item, row);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "download";
    if (err.message !== "cancelled") {
      const status = row.querySelector(".meta-status");
      if (status) status.textContent = err.message;
    }
    return;
  }

  const jobId = crypto.randomUUID();
  rowsByJobId.set(jobId, row);
  btn.textContent = "downloading…";
  chrome.runtime.sendMessage(
    {
      type: "DOWNLOAD_STREAM",
      jobId,
      playlistUrl,
      originUrl: item.url,
      filename: filenameFromUrl(item.url, item.title, "mp4"),
    },
    (response) => {
      if (!response || !response.ok) {
        setProgress(row, { status: "error", error: (response && response.error) || "failed to start" });
      }
    }
  );
}

// Live job updates: storage.session changes are the single source of truth.
chrome.storage.session.onChanged.addListener((changes) => {
  for (const [key, change] of Object.entries(changes)) {
    if (!key.startsWith("job-") || !change.newValue) continue;
    const row = rowsByJobId.get(change.newValue.jobId);
    if (row) setProgress(row, change.newValue);
  }
});

function kindPill(item, isDash) {
  const pill = document.createElement("span");
  if (isDash) {
    pill.className = "kind-pill dash";
    pill.textContent = "dash";
  } else if (item.kind === "stream") {
    pill.className = "kind-pill stream";
    pill.textContent = "hls";
  } else {
    pill.className = "kind-pill file";
    pill.textContent = extFromUrl(item.url) || "file";
  }
  return pill;
}

function renderItem(item) {
  const row = document.createElement("div");
  row.className = "item";
  row.setAttribute("role", "listitem");

  const info = document.createElement("div");
  info.className = "item-info";
  info.tabIndex = 0;
  info.setAttribute("role", "button");
  info.setAttribute("aria-label", "toggle preview");

  const name = document.createElement("div");
  name.className = "item-name";
  name.textContent = filenameFromUrl(item.url, item.title);
  info.appendChild(name);

  const isDash = /\.mpd(\?|#|$)/i.test(item.url);

  const meta = document.createElement("div");
  meta.className = "item-meta";
  meta.appendChild(kindPill(item, isDash));

  const status = document.createElement("span");
  status.className = "meta-status";
  status.textContent = item.source;
  meta.appendChild(status);

  info.appendChild(meta);

  const openPreviewHandler = () => togglePreview(item, row);
  info.addEventListener("click", openPreviewHandler);
  info.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openPreviewHandler();
    }
  });

  row.appendChild(info);

  const btn = document.createElement("button");
  btn.className = "action";
  if (isDash) {
    btn.classList.add("is-ghost");
    btn.textContent = "unsupported";
    btn.disabled = true;
    btn.title = "DASH download isn't implemented yet";
  } else if (item.kind === "stream") {
    btn.textContent = "download";
    btn.addEventListener("click", () => startStreamDownload(item, row, btn));
  } else {
    btn.textContent = "download";
    btn.addEventListener("click", () => {
      btn.disabled = true;
      btn.textContent = "saving…";
      chrome.runtime.sendMessage(
        { type: "DOWNLOAD", url: item.url, filename: filenameFromUrl(item.url, item.title) },
        (response) => {
          if (response && response.ok) {
            btn.textContent = "saved";
          } else {
            btn.classList.add("is-danger");
            btn.textContent = "retry";
            btn.disabled = false;
          }
        }
      );
    });
  }
  row.appendChild(btn);
  row.dataset.url = item.url;
  return row;
}

// Re-attach in-flight or finished jobs to their rows when the popup reopens.
function rehydrateJobs(listEl) {
  chrome.runtime.sendMessage({ type: "GET_JOBS" }, (response) => {
    const jobs = (response && response.jobs) || [];
    for (const job of jobs) {
      if (!job.originUrl) continue;
      const row = listEl.querySelector(`[data-url="${CSS.escape(job.originUrl)}"]`);
      if (!row) continue;
      rowsByJobId.set(job.jobId, row);
      const btn = row.querySelector("button");
      if (job.status === "running") {
        btn.disabled = true;
        btn.textContent = "downloading…";
      }
      setProgress(row, job);
    }
  });
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const listEl = document.getElementById("list");
  const countEl = document.getElementById("count");

  if (!tab) {
    listEl.innerHTML = '<p class="empty">no active tab</p>';
    return;
  }

  chrome.runtime.sendMessage({ type: "GET_DETECTED", tabId: tab.id }, (response) => {
    const items = (response && response.items) || [];
    listEl.innerHTML = "";
    if (items.length === 0) {
      listEl.innerHTML = '<p class="empty">no media detected on this page yet</p>';
    } else {
      items
        .slice()
        .sort((a, b) => a.kind.localeCompare(b.kind))
        .forEach((item) => listEl.appendChild(renderItem(item)));
    }
    countEl.textContent = `${items.length} item${items.length === 1 ? "" : "s"}`;
    rehydrateJobs(listEl);
  });
}

init();
