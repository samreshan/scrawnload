(function () {
  const MEDIA_LINK_REGEX = /\.(mp4|webm|mkv|mov|m4v|m4a|mp3|ogg|oga|wav|flac|aac|m3u8|mpd)(\?|#|$)/i;
  const seen = new Set();
  let stopped = false;
  let observer = null;
  let intervalId = null;

  // Reloading/updating the extension orphans every content script already
  // injected in open tabs — chrome.runtime.sendMessage then throws (or
  // rejects with) "Extension context invalidated." Without this, scan()
  // would keep firing every 4s forever on a page left open across a reload.
  function stop() {
    stopped = true;
    if (observer) observer.disconnect();
    if (intervalId) clearInterval(intervalId);
  }

  function report(url) {
    if (stopped || !url || /^(blob|data):/.test(url)) return;
    let absolute;
    try {
      absolute = new URL(url, document.baseURI).href;
    } catch {
      return;
    }
    if (seen.has(absolute)) return;
    seen.add(absolute);
    try {
      const sending = chrome.runtime.sendMessage({
        type: "MEDIA_DETECTED",
        url: absolute,
        title: document.title,
      });
      if (sending && typeof sending.catch === "function") {
        sending.catch(() => stop());
      }
    } catch {
      stop();
    }
  }

  function scan() {
    if (stopped) return;

    document.querySelectorAll("video, audio").forEach((el) => {
      if (el.currentSrc) report(el.currentSrc);
      if (el.src) report(el.src);
      el.querySelectorAll("source").forEach((s) => s.src && report(s.src));
    });

    document
      .querySelectorAll(
        'meta[property="og:video"], meta[property="og:video:url"], ' +
          'meta[property="og:video:secure_url"], meta[property="og:audio"]'
      )
      .forEach((m) => m.content && report(m.content));

    document.querySelectorAll("a[href]").forEach((a) => {
      if (MEDIA_LINK_REGEX.test(a.href)) report(a.href);
    });
  }

  scan();

  observer = new MutationObserver(() => scan());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Single-page apps often swap video sources via history.pushState without
  // triggering DOM mutations we'd otherwise catch, so poll as a fallback.
  intervalId = setInterval(scan, 4000);
})();
